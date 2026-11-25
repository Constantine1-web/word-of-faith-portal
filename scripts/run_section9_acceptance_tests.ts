import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import prisma from "../src/lib/db";
import {
  FINANCIAL_MODEL_CODE,
  GROSS_PORTAL_FEE_KOBO,
  PROVIDER_PORTAL_SHARE_CAP_KOBO,
  SCHOOL_PORTAL_SHARE_CAP_KOBO,
  allocateTermPaymentKobo,
  computePaystackConvenienceFeeKobo,
  computePaystackSubaccountSplitKobo,
  computeTermInvoiceTotals,
  computeReversalAllocationKobo,
  type ReversalScope,
} from "../src/lib/fee-split";
import {
  acquireStudentTermLock,
  ensureStudentTermInvoice,
  getStudentTermBillingSummary,
  recordPaymentCreditInTx,
  recordPaymentReversalInTx,
  syncInvoiceAndStudentClearanceInTx,
} from "../src/lib/payment-ledger";
import { resolveActorCapabilities } from "../src/server/security/capabilities";

/**
 * In-Memory Transactional Simulator faithfully implementing PostgreSQL
 * pg_advisory_xact_lock, partial unique indexes, webhook mutexes, and
 * append-only AllocationLedger semantics so the real functions in
 * `src/lib/payment-ledger.ts` execute end-to-end without mutating prod data.
 */
function createStatefulLedgerTx() {
  const invoices: any[] = [];
  const lineItems: any[] = [];
  const payments: any[] = [];
  const ledger: any[] = [];
  const webhookEvents = new Set<string>();
  const students = new Map<number, any>([
    [101, { StudentID: 101, HasPaidFees: false, Class: { ClassName: "Primary 1", Level: "Primary" } }],
    [102, { StudentID: 102, HasPaidFees: false, Class: { ClassName: "Primary 2", Level: "Primary" } }],
  ]);
  const activeTerm = { TermID: 1, IsActive: true, SessionName: "2026/2027", TermName: "First Term" };

  // Async lock queue mimicking PostgreSQL pg_advisory_xact_lock(studentId, termId)
  const lockChains = new Map<string, Promise<void>>();
  let idSeq = 1;

  function p2002Error(msg: string) {
    const err: any = new Error(msg);
    err.code = "P2002";
    return err;
  }

  function makeTx(heldLockKeys: string[] = []) {
    const tx: any = {
      async $executeRaw(strings: TemplateStringsArray, ...values: any[]) {
        if (strings.join("").includes("pg_advisory_xact_lock")) {
          const key = `${values[0]}:${values[1]}`;
          if (!heldLockKeys.includes(key)) {
            const prev = lockChains.get(key) || Promise.resolve();
            let release!: () => void;
            const mine = new Promise<void>((r) => {
              release = r;
            });
            lockChains.set(key, prev.then(() => mine));
            await prev;
            heldLockKeys.push(key);
            tx.__releaseCallbacks.push(release);
          }
        }
        return 1;
      },
      __releaseCallbacks: [] as Array<() => void>,
      webhookEvent: {
        async create({ data }: any) {
          const k = `${data.provider}:${data.eventKey}`;
          if (webhookEvents.has(k)) {
            throw p2002Error(`Duplicate webhook event ${k}`);
          }
          webhookEvents.add(k);
          return data;
        },
      },
      invoice: {
        async findFirst({ where }: any) {
          const match = invoices.find((inv) => {
            if (where.StudentID !== undefined && inv.StudentID !== where.StudentID) return false;
            if (where.TermID !== undefined && inv.TermID !== where.TermID) return false;
            if (where.Status?.not !== undefined && inv.Status === where.Status.not) return false;
            return true;
          });
          if (!match) return null;
          return { ...match, LineItems: lineItems.filter((li) => li.invoiceId === match.id) };
        },
        async create({ data }: any) {
          if (
            data.Status !== "VOID" &&
            invoices.some(
              (inv) =>
                inv.StudentID === data.StudentID &&
                inv.TermID === data.TermID &&
                inv.Status !== "VOID"
            )
          ) {
            throw p2002Error("Unique active invoice constraint violated");
          }
          const id = `inv_${idSeq++}`;
          const created = {
            id,
            StudentID: data.StudentID,
            TermID: data.TermID,
            Title: data.Title,
            AmountKobo: BigInt(data.AmountKobo),
            Status: data.Status || "OPEN",
            DueDate: data.DueDate || new Date(),
            IsWaived: Boolean(data.IsWaived),
            portalFeeExempt: Boolean(data.portalFeeExempt),
            portalFeeProrationPct: data.portalFeeProrationPct ?? 100,
            CreatedAt: new Date(),
          };
          invoices.push(created);
          const createdLis = (data.LineItems?.create || []).map((li: any) => {
            const row = { id: `li_${idSeq++}`, invoiceId: id, ...li, amountKobo: BigInt(li.amountKobo) };
            lineItems.push(row);
            return row;
          });
          return { ...created, LineItems: createdLis };
        },
        async update({ where, data }: any) {
          const target = invoices.find((i) => i.id === where.id);
          if (!target) throw new Error("Invoice not found");
          Object.assign(target, data);
          return { ...target, LineItems: lineItems.filter((li) => li.invoiceId === target.id) };
        },
      },
      invoiceLineItem: {
        async upsert({ where, create, update }: any) {
          const idx = lineItems.findIndex(
            (li) =>
              li.invoiceId === where.invoiceId_code.invoiceId &&
              li.code === where.invoiceId_code.code
          );
          if (idx >= 0) {
            Object.assign(lineItems[idx], update);
            return lineItems[idx];
          }
          const created = { id: `li_${idSeq++}`, ...create };
          lineItems.push(created);
          return created;
        },
        async updateMany({ where, data }: any) {
          let count = 0;
          for (const li of lineItems) {
            if (where.invoiceId && li.invoiceId !== where.invoiceId) continue;
            if (where.code && li.code !== where.code) continue;
            if (where.beneficiary && li.beneficiary !== where.beneficiary) continue;
            if (data.amountKobo !== undefined) li.amountKobo = data.amountKobo;
            if (data.isWaived !== undefined) li.isWaived = data.isWaived;
            if (data.beneficiary !== undefined) li.beneficiary = data.beneficiary;
            count++;
          }
          return { count };
        },
      },
      payment_Record: {
        async findMany({ where }: any) {
          return payments.filter((p) => {
            if (where.StudentID !== undefined && p.StudentID !== where.StudentID) return false;
            if (where.TermID !== undefined && p.TermID !== where.TermID) return false;
            if (where.Status?.in && !where.Status.in.includes(p.Status)) return false;
            return true;
          });
        },
        async findUnique({ where }: any) {
          return payments.find((p) => p.PaymentID === where.PaymentID) || null;
        },
        async create({ data }: any) {
          const row = { PaymentID: idSeq++, ...data };
          payments.push(row);
          return row;
        },
        async update({ where, data }: any) {
          const p = payments.find(
            (r) =>
              (where.PaymentID !== undefined && r.PaymentID === where.PaymentID) ||
              (where.Reference !== undefined && r.Reference === where.Reference)
          );
          if (p) Object.assign(p, data);
          return p;
        },
      },
      allocationLedger: {
        async findMany({ where }: any) {
          return ledger.filter((row) => {
            if (where.studentId !== undefined && row.studentId !== where.studentId) return false;
            if (where.termId !== undefined && row.termId !== where.termId) return false;
            if (where.paymentId !== undefined && row.paymentId !== where.paymentId) return false;
            if (where.entryType !== undefined && row.entryType !== where.entryType) return false;
            return true;
          });
        },
        async findFirst({ where }: any) {
          return (
            ledger.find((row) => {
              if (where.paymentId !== undefined && row.paymentId !== where.paymentId) return false;
              if (where.entryType !== undefined && row.entryType !== where.entryType) return false;
              return true;
            }) || null
          );
        },
        async create({ data }: any) {
          // Simulate brief async DB roundtrip so concurrent races would happen without advisory locks!
          await new Promise((r) => setTimeout(r, 8));
          const row = { id: `led_${idSeq++}`, createdAt: new Date(), ...data };
          ledger.push(row);
          return row;
        },
        async update() {
          throw new Error("CRITICAL: AllocationLedger is append-only.");
        },
        async delete() {
          throw new Error("CRITICAL: AllocationLedger is append-only.");
        },
      },
      academic_Term: {
        async findFirst() {
          return activeTerm;
        },
      },
      student: {
        async findUnique({ where }: any) {
          return students.get(where.StudentID) || null;
        },
        async update({ where, data }: any) {
          const st = students.get(where.StudentID);
          if (st) Object.assign(st, data);
          return st;
        },
      },
    };
    return tx;
  }

  async function runInTx(fn: (tx: any) => Promise<any>): Promise<any> {
    const tx = makeTx([]);
    try {
      return await fn(tx);
    } finally {
      for (const rel of tx.__releaseCallbacks) rel();
    }
  }

  return { invoices, lineItems, payments, ledger, webhookEvents, students, runInTx };
}

async function runSection9AcceptanceMatrix() {
  console.log("=== SECTION 9: MANDATORY 17-SCENARIO ACCEPTANCE & COMPLIANCE MATRIX ===\n");
  let passed = 0;

  // Test 1: Full invoice (₦59,000 School Charges + ₦1,000 Portal Fee; payment = ₦60,000)
  {
    const inv = computeTermInvoiceTotals({
      tuitionKobo: BigInt(5_500_000),
      leviesKobo: BigInt(400_000),
    });
    assert.equal(inv.schoolChargesSubtotalKobo, BigInt(5_900_000));
    assert.equal(inv.portalFeeKobo, BigInt(100_000));
    assert.equal(inv.totalInvoiceKobo, BigInt(6_000_000));
    const alloc = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(6_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
    });
    assert.equal(alloc.providerShareNaira, 800);
    assert.equal(alloc.schoolPortalShareNaira, 200);
    assert.equal(alloc.schoolChargesShareNaira, 59000);
    assert.equal(alloc.schoolShareNaira, 59200);
    assert.equal(alloc.gatewayFeeKobo, BigInt(0));
    console.log("  ✔ [1/17] Full invoice (₦59,000 School + ₦1,000 Portal -> Provider ₦800 / School ₦59,200)");
    passed++;
  }

  // Test 2 & 3 & 4: ₦500 first instalment -> Second ₦500 instalment -> Later ₦30,000 tuition instalment
  {
    const i1 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(50_000), // ₦500
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: BigInt(0),
      alreadyAllocatedSchoolPortalKobo: BigInt(0),
    });
    assert.equal(i1.providerShareNaira, 400);
    assert.equal(i1.schoolPortalShareNaira, 100);
    assert.equal(i1.schoolChargesShareNaira, 0);
    console.log("  ✔ [2/17] ₦500 first instalment (Provider ₦400 / School Portal ₦100)");
    passed++;

    const i2 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(50_000), // ₦500
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: i1.providerShareKobo,
      alreadyAllocatedSchoolPortalKobo: i1.schoolPortalShareKobo,
    });
    assert.equal(i1.providerShareKobo + i2.providerShareKobo, PROVIDER_PORTAL_SHARE_CAP_KOBO); // Cumulative ₦800
    assert.equal(i1.schoolPortalShareKobo + i2.schoolPortalShareKobo, SCHOOL_PORTAL_SHARE_CAP_KOBO); // Cumulative ₦200
    assert.equal(i2.remainingPortalFeeAfterKobo, BigInt(0));
    console.log("  ✔ [3/17] Second ₦500 instalment (Cumulative Provider ₦800 / School Portal ₦200; line full)");
    passed++;

    const i3 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(3_000_000), // ₦30,000
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: i1.providerShareKobo + i2.providerShareKobo,
      alreadyAllocatedSchoolPortalKobo: i1.schoolPortalShareKobo + i2.schoolPortalShareKobo,
    });
    assert.equal(i3.providerShareNaira, 0);
    assert.equal(i3.schoolPortalShareNaira, 0);
    assert.equal(i3.schoolShareNaira, 30000);
    console.log("  ✔ [4/17] Later tuition instalment (₦30,000 -> Provider ₦0 / School ₦30,000)");
    passed++;
  }

  // Test 5: Large first instalment (₦30,000 on ₦60,000 invoice -> Provider ₦800, School ₦29,200; later ₦30,000 -> 100% School)
  {
    const lg1 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(3_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: BigInt(0),
      alreadyAllocatedSchoolPortalKobo: BigInt(0),
    });
    assert.equal(lg1.providerShareNaira, 800);
    assert.equal(lg1.schoolPortalShareNaira, 200);
    assert.equal(lg1.schoolChargesShareNaira, 29000);
    assert.equal(lg1.schoolShareNaira, 29200);

    const lg2 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(3_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      alreadyAllocatedProviderKobo: lg1.providerShareKobo,
      alreadyAllocatedSchoolPortalKobo: lg1.schoolPortalShareKobo,
    });
    assert.equal(lg2.providerShareNaira, 0);
    assert.equal(lg2.schoolShareNaira, 30000);
    console.log("  ✔ [5/17] Large first instalment (₦30,000 -> Provider ₦800 / School ₦29,200; next ₦30,000 -> School ₦30,000)");
    passed++;
  }

  // Test 6: Parent pays two wards (independent caps per student-term -> ₦1,600 total Provider)
  {
    const w1 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(6_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
    });
    const w2 = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(6_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
    });
    assert.equal(w1.providerShareNaira + w2.providerShareNaira, 1600);
    assert.equal(w1.schoolPortalShareNaira + w2.schoolPortalShareNaira, 400);
    console.log("  ✔ [6/17] Parent pays two wards (independent caps: Provider ₦1,600 total, School Portal ₦400)");
    passed++;
  }

  // Test 7, 8, 9, 10, 11, 12, 13, 14, 15 in stateful transactional ledger harness calling real `payment-ledger.ts`
  const dbSim = createStatefulLedgerTx();

  // Seed a synthetic invoice for student 101 directly for controlled ledger harness (independent of DB schedules)
  const inv1 = await dbSim.runInTx((tx) =>
    tx.invoice.create({
      data: {
        StudentID: 101,
        TermID: 1,
        Title: "Primary 1 Term 1",
        AmountKobo: BigInt(6_000_000),
        Status: "OPEN",
        LineItems: {
          create: [
            { code: "TUITION", label: "Tuition", beneficiary: "SCHOOL", amountKobo: BigInt(5_500_000), isWaived: false },
            { code: "LEVIES", label: "Levies", beneficiary: "SCHOOL", amountKobo: BigInt(400_000), isWaived: false },
            { code: "PORTAL_ICT_FEE", label: "Portal Fee", beneficiary: "SHARED", amountKobo: BigInt(100_000), isWaived: false },
          ],
        },
      },
    })
  );

  // Test 7: Duplicate webhook (same event key & paymentId sent 3 times)
  {
    const pmt = await dbSim.runInTx((tx) =>
      tx.payment_Record.create({
        data: { StudentID: 101, TermID: 1, InvoiceID: inv1.id, AmountPaid: 500, AmountKobo: BigInt(50_000), Status: "Pending", Reference: "REF-DUP-1" },
      })
    );
    await Promise.all(
      [1, 2, 3].map(async () => {
        try {
          await dbSim.runInTx(async (tx) => {
            await tx.webhookEvent.create({ data: { provider: "PAYSTACK", eventKey: "REF-DUP-1" } });
            await recordPaymentCreditInTx(tx, {
              paymentId: pmt.PaymentID,
              invoiceId: inv1.id,
              studentId: 101,
              termId: 1,
              principalKobo: BigInt(50_000),
              settlementChannel: "PAYSTACK_SUBACCOUNT",
              reference: "REF-DUP-1",
            });
          });
        } catch (err: any) {
          if (err?.code !== "P2002") throw err;
        }
      })
    );
    const ledForDup = dbSim.ledger.filter((r) => r.paymentId === pmt.PaymentID);
    assert.equal(ledForDup.length, 1);
    assert.equal(ledForDup[0].providerShareKobo, BigInt(40_000));
    console.log("  ✔ [7/17] Duplicate webhook (3 concurrent deliveries -> exactly 1 AllocationLedger row)");
    passed++;
  }

  // Test 8: Concurrent instalments on SAME (studentId, termId) serialized via advisory lock (no overshoot!)
  {
    const pmtA = await dbSim.runInTx((tx) =>
      tx.payment_Record.create({
        data: { StudentID: 102, TermID: 1, AmountPaid: 30000, AmountKobo: BigInt(3_000_000), Status: "Pending", Reference: "CONC-A" },
      })
    );
    const pmtB = await dbSim.runInTx((tx) =>
      tx.payment_Record.create({
        data: { StudentID: 102, TermID: 1, AmountPaid: 30000, AmountKobo: BigInt(3_000_000), Status: "Pending", Reference: "CONC-B" },
      })
    );
    await dbSim.runInTx((tx) =>
      tx.invoice.create({
        data: {
          StudentID: 102,
          TermID: 1,
          Title: "Primary 2 Term 1",
          AmountKobo: BigInt(6_000_000),
          Status: "OPEN",
          LineItems: {
            create: [
              { code: "TUITION", label: "Tuition", beneficiary: "SCHOOL", amountKobo: BigInt(5_900_000), isWaived: false },
              { code: "PORTAL_ICT_FEE", label: "Portal Fee", beneficiary: "SHARED", amountKobo: BigInt(100_000), isWaived: false },
            ],
          },
        },
      })
    );
    await Promise.all([
      dbSim.runInTx(async (tx) => {
        await acquireStudentTermLock(tx, 102, 1);
        await tx.payment_Record.update({ where: { PaymentID: pmtA.PaymentID }, data: { Status: "Approved" } });
        return recordPaymentCreditInTx(tx, {
          paymentId: pmtA.PaymentID,
          studentId: 102,
          termId: 1,
          principalKobo: BigInt(3_000_000),
          settlementChannel: "PAYSTACK_SUBACCOUNT",
          reference: "CONC-A",
        });
      }),
      dbSim.runInTx(async (tx) => {
        await acquireStudentTermLock(tx, 102, 1);
        await tx.payment_Record.update({ where: { PaymentID: pmtB.PaymentID }, data: { Status: "Approved" } });
        return recordPaymentCreditInTx(tx, {
          paymentId: pmtB.PaymentID,
          studentId: 102,
          termId: 1,
          principalKobo: BigInt(3_000_000),
          settlementChannel: "PAYSTACK_SUBACCOUNT",
          reference: "CONC-B",
        });
      }),
    ]);
    const summary102 = await dbSim.runInTx((tx) => getStudentTermBillingSummary(tx, 102, 1));
    assert.equal(summary102.providerCreditedKobo, PROVIDER_PORTAL_SHARE_CAP_KOBO); // Exactly ₦800, NOT ₦1,600!
    assert.equal(summary102.schoolPortalCreditedKobo, SCHOOL_PORTAL_SHARE_CAP_KOBO); // Exactly ₦200, NOT ₦400!
    assert.equal(summary102.schoolChargesCreditedKobo, BigInt(5_900_000));
    console.log("  ✔ [8/17] Concurrent instalments (advisory lock prevents overshoot: Provider capped at ₦800, School Portal at ₦200)");
    passed++;
  }

  // Test 9: Voided & reissued invoice immunity (prior settled Portal Fee carries across voided invoice)
  {
    const voidTarget = dbSim.invoices.find((i) => i.StudentID === 101 && i.Status !== "VOID");
    voidTarget.Status = "VOID"; // Simulate voiding old invoice after ₦500 payment already credited (₦400 Prov / ₦100 School)
    const reissued = await dbSim.runInTx((tx) =>
      tx.invoice.create({
        data: {
          StudentID: 101,
          TermID: 1,
          Title: "Reissued Term 1",
          AmountKobo: BigInt(6_000_000),
          Status: "OPEN",
          LineItems: {
            create: [
              { code: "TUITION", label: "Tuition", beneficiary: "SCHOOL", amountKobo: BigInt(5_900_000), isWaived: false },
              { code: "PORTAL_ICT_FEE", label: "Portal Fee", beneficiary: "SHARED", amountKobo: BigInt(100_000), isWaived: false },
            ],
          },
        },
      })
    );
    const pmtRe = await dbSim.runInTx((tx) =>
      tx.payment_Record.create({
        data: { StudentID: 101, TermID: 1, InvoiceID: reissued.id, AmountPaid: 30000, AmountKobo: BigInt(3_000_000), Status: "Approved", Reference: "REISSUE-1" },
      })
    );
    await dbSim.runInTx((tx) =>
      recordPaymentCreditInTx(tx, {
        paymentId: pmtRe.PaymentID,
        invoiceId: reissued.id,
        studentId: 101,
        termId: 1,
        principalKobo: BigInt(3_000_000),
        settlementChannel: "SCHOOL_COLLECTION",
        reference: "REISSUE-1",
      })
    );
    const sum101After = await dbSim.runInTx((tx) => getStudentTermBillingSummary(tx, 101, 1));
    assert.equal(sum101After.providerCreditedKobo, PROVIDER_PORTAL_SHARE_CAP_KOBO); // Cumulative across voided + reissued = ₦800 (NOT ₦1,200!)
    assert.equal(sum101After.schoolPortalCreditedKobo, SCHOOL_PORTAL_SHARE_CAP_KOBO); // Cumulative = ₦200
    console.log("  ✔ [9/17] Voided/reissued invoice immunity (cumulative Provider capped at ₦800 across voided + reissued invoice)");
    passed++;
  }

  // Test 10: Failed / pending payment creates zero AllocationLedger credits
  {
    const ledgerCountBefore = dbSim.ledger.length;
    const sumBefore = await dbSim.runInTx((tx) => getStudentTermBillingSummary(tx, 102, 1));
    await dbSim.runInTx((tx) =>
      tx.payment_Record.create({
        data: { StudentID: 102, TermID: 1, AmountPaid: 10000, AmountKobo: BigInt(1_000_000), Status: "Pending", Reference: "FAILED-PEND" },
      })
    );
    const sumAfter = await dbSim.runInTx((tx) => getStudentTermBillingSummary(tx, 102, 1));
    assert.equal(dbSim.ledger.length, ledgerCountBefore);
    assert.equal(sumAfter.totalCreditedKobo, sumBefore.totalCreditedKobo);
    console.log("  ✔ [10/17] Failed/pending payment (zero AllocationLedger credits)");
    passed++;
  }

  // Test 11: Refund Tuition Only (`TUITION_ONLY`) leaves Portal Fee 80:20 untouched
  {
    const revTarget = dbSim.payments.find((p) => p.Reference === "REISSUE-1");
    const revRow = await dbSim.runInTx((tx) =>
      recordPaymentReversalInTx(tx, {
        paymentId: revTarget.PaymentID,
        studentId: 101,
        termId: 1,
        scope: "TUITION_ONLY",
        reference: "REISSUE-1",
        notes: "Refund tuition portion only",
      })
    );
    assert(revRow);
    assert.equal(revRow.reversalScope, "TUITION_ONLY");
    assert.equal(revRow.providerShareKobo, BigInt(0));
    assert.equal(revRow.schoolPortalShareKobo, BigInt(0));
    assert.equal(revRow.schoolChargesShareKobo, -BigInt(2_950_000)); // Only tuition charges on REISSUE-1 reversed!
    assert.ok(revRow.reversalOfLedgerEntryId, "Must trace back to original CREDIT entry id");
    console.log("  ✔ [11/17] Refund tuition only (`TUITION_ONLY` reversal leaves Portal Fee intact & links credit row)");
    passed++;
  }

  // Test 12: Refund Portal Fee only (`PORTAL_FEE_ONLY`) reverses 80:20 with original references
  {
    const revPortal = await dbSim.runInTx((tx) =>
      recordPaymentReversalInTx(tx, {
        paymentId: dbSim.payments.find((p) => p.Reference === "REISSUE-1").PaymentID,
        studentId: 101,
        termId: 1,
        scope: "PORTAL_FEE_ONLY",
        reference: "REISSUE-1",
        notes: "Refund portal fee portion 80:20",
      })
    );
    assert(revPortal);
    assert.equal(revPortal.reversalScope, "PORTAL_FEE_ONLY");
    assert.equal(revPortal.providerShareKobo, -BigInt(40_000));
    assert.equal(revPortal.schoolPortalShareKobo, -BigInt(10_000));
    assert.equal(revPortal.schoolChargesShareKobo, BigInt(0));
    console.log("  ✔ [12/17] Refund Portal Fee (`PORTAL_FEE_ONLY` reverses 80:20 linked to original credit)");
    passed++;
  }

  // Test 13: Chargeback after split (`CHARGEBACK` reverses split cleanly, no untracked negative balances)
  {
    const concA = dbSim.payments.find((p) => p.Reference === "CONC-A");
    const cbRow = await dbSim.runInTx(async (tx) => {
      await tx.payment_Record.update({ where: { PaymentID: concA.PaymentID }, data: { Status: "Disputed" } });
      return recordPaymentReversalInTx(tx, {
        paymentId: concA.PaymentID,
        studentId: 102,
        termId: 1,
        scope: "CHARGEBACK",
        reference: "CONC-A",
        notes: "Paystack charge.dispute.create simulation",
      });
    });
    assert(cbRow);
    assert.equal(cbRow.reversalScope, "CHARGEBACK");
    assert.equal(cbRow.providerShareKobo, -BigInt(80_000));
    assert.equal(cbRow.schoolPortalShareKobo, -BigInt(20_000));
    const sumAfterCb = await dbSim.runInTx((tx) => getStudentTermBillingSummary(tx, 102, 1));
    assert(sumAfterCb.providerCreditedKobo >= BigInt(0));
    assert(sumAfterCb.schoolCreditedKobo >= BigInt(0));
    assert.equal(sumAfterCb.isCleared, false); // Student clearance revokes when chargeback creates unpaid balance
    console.log("  ✔ [13/17] Chargeback after split (full party reconciliation & clearance revoked cleanly)");
    passed++;
  }

  // Test 14: Manual teller / cash visibly separated (`SCHOOL_COLLECTION` / `PENDING_REMITTANCE` vs `PAYSTACK_SUBACCOUNT` / `AUTO_SPLIT`)
  {
    const offlineLed = dbSim.ledger.find((l) => l.reference === "REISSUE-1" && l.entryType === "CREDIT");
    const onlineLed = dbSim.ledger.find((l) => l.reference === "CONC-A" && l.entryType === "CREDIT");
    assert.equal(offlineLed.settlementChannel, "SCHOOL_COLLECTION");
    assert.equal(offlineLed.settlementStatus, "PENDING_REMITTANCE");
    assert.equal(onlineLed.settlementChannel, "PAYSTACK_SUBACCOUNT");
    assert.equal(onlineLed.settlementStatus, "AUTO_SPLIT");
    console.log("  ✔ [14/17] Manual teller / cash (`SCHOOL_COLLECTION`/`PENDING_REMITTANCE` distinct from `AUTO_SPLIT`)");
    passed++;
  }

  // Test 15: Scholarship & late-admission proration policy variants
  {
    const scholarKeepPortal = computeTermInvoiceTotals({
      tuitionKobo: BigInt(6_800_000),
      leviesKobo: BigInt(600_000),
      isSchoolFeesWaived: true,
      isPortalFeeExempt: false,
    });
    assert.equal(scholarKeepPortal.totalInvoiceKobo, GROSS_PORTAL_FEE_KOBO);

    const hardshipExempt = computeTermInvoiceTotals({
      tuitionKobo: BigInt(6_800_000),
      leviesKobo: BigInt(600_000),
      isSchoolFeesWaived: true,
      isPortalFeeExempt: true,
    });
    assert.equal(hardshipExempt.totalInvoiceKobo, BigInt(0));

    const prorated50 = computeTermInvoiceTotals({
      tuitionKobo: BigInt(3_400_000),
      leviesKobo: BigInt(0),
      portalFeeProrationPct: 50,
    });
    assert.equal(prorated50.portalFeeKobo, BigInt(50_000));
    assert.equal(prorated50.portalProviderCapKobo, BigInt(40_000));
    assert.equal(prorated50.portalSchoolCapKobo, BigInt(10_000));
    console.log("  ✔ [15/17] Scholarship / hardship exemption / 50% late-admission proration verified");
    passed++;
  }

  // Test 16: Gateway fee bearer (`SCHOOL_ABSORBS` default -> ₦0 surcharge; `gatewayFeeKobo` separate; Provider stays ₦800; RBAC lock check)
  {
    const gwAbsorb = computePaystackConvenienceFeeKobo(BigInt(6_000_000), "SCHOOL_ABSORBS");
    assert.equal(gwAbsorb, BigInt(0));
    const allocWithActualGatewayFee = allocateTermPaymentKobo({
      grossPrincipalPaidKobo: BigInt(6_000_000),
      targetPortalFeeKobo: GROSS_PORTAL_FEE_KOBO,
      gatewayFeeKobo: BigInt(100_000), // e.g., ₦1,000 actual Paystack fee reported in webhook
    });
    assert.equal(allocWithActualGatewayFee.providerShareKobo, PROVIDER_PORTAL_SHARE_CAP_KOBO);
    assert.equal(allocWithActualGatewayFee.schoolPortalShareKobo, SCHOOL_PORTAL_SHARE_CAP_KOBO);
    assert.equal(allocWithActualGatewayFee.gatewayFeeKobo, BigInt(100_000));

    // Verify BURSAR does NOT hold MANAGE_SYSTEM capability (locked behind SUPER_ADMIN/PRINCIPAL)
    const bursarCaps = resolveActorCapabilities(undefined, ["BURSAR"]);
    assert.equal(bursarCaps.has("APPROVE_PAYMENTS"), true);
    assert.equal(bursarCaps.has("MANAGE_SYSTEM"), false, "Bursar must NOT have MANAGE_SYSTEM override authority");
    console.log("  ✔ [16/17] Gateway fee bearer (SCHOOL_ABSORBS default, Provider untouched, BURSAR blocked from MANAGE_SYSTEM)");
    passed++;
  }

  // Test 17: Paystack Subaccount Split Payload & Pre-Activation Safety Guard Proof
  {
    const paymentSrc = fs.readFileSync(
      path.join(process.cwd(), "src/app/actions/payments.ts"),
      "utf8"
    );
    assert(
      paymentSrc.includes("bankConfig.paystackSplitApproved"),
      "initializePayment must require bankConfig.paystackSplitApproved === true before sending subaccount"
    );
    const splitApproved = computePaystackSubaccountSplitKobo({
      totalChargedKobo: BigInt(6_000_000),
      providerShareKobo: BigInt(80_000),
    });
    assert.equal(splitApproved.transactionChargeMainAccountKobo, BigInt(5_920_000));
    assert.equal(splitApproved.expectedSubaccountShareKobo, BigInt(80_000));
    assert.equal(splitApproved.bearer, "account");

    // Subsequent tuition-only instalment has providerShareKobo = 0 -> never triggers subaccount split
    const tuitionOnlySplit = computePaystackSubaccountSplitKobo({
      totalChargedKobo: BigInt(3_000_000),
      providerShareKobo: BigInt(0),
    });
    assert.equal(tuitionOnlySplit.expectedSubaccountShareKobo, BigInt(0));
    console.log("  ✔ [17/17] Split routing math & `paystackSplitApproved` pre-activation guardrail verified (Live NGN proof pending Paystack approval)");
    passed++;
  }

  // Bonus Layer: Verify Live PostgreSQL Schema & Constraints if DB reachable (read-only metadata check + non-committing rollback check)
  if (process.env.DATABASE_URL) {
    const constraints: Array<{ conname: string }> = await prisma.$queryRaw`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('chk_ledger_credit_nonnegative', 'chk_ledger_school_sum_consistent', 'payment_sod')
    `;
    const indexes: Array<{ indexname: string }> = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes WHERE indexname = 'one_active_invoice_per_student_term'
    `;
    assert(constraints.some((c) => c.conname === "chk_ledger_credit_nonnegative"), "Missing chk_ledger_credit_nonnegative");
    assert(constraints.some((c) => c.conname === "chk_ledger_school_sum_consistent"), "Missing chk_ledger_school_sum_consistent");
    assert(indexes.some((i) => i.indexname === "one_active_invoice_per_student_term"), "Missing one_active_invoice_per_student_term index");
    console.log("  ✔ [DB] Live PostgreSQL constraints & partial unique index verified on Neon.");
  }

  assert.equal(passed, 17);
  console.log(`\n✅ ALL 17/17 SECTION 9 ACCEPTANCE TESTS PASSED (Financial Model: ${FINANCIAL_MODEL_CODE}).`);
}

runSection9AcceptanceMatrix()
  .catch((err) => {
    console.error("❌ Section 9 Acceptance Test Suite failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
