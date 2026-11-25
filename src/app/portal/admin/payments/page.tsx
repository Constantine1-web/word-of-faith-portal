import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import PaymentsClient from "./PaymentsClient";
import { requireCapability } from "@/lib/authz";
import { ensureAndListFeeSchedules } from "@/lib/fee-schedule";
import { allocateTermPaymentKobo, PORTAL_ICT_SERVICE_FEE_KOBO } from "@/lib/fee-split";
import { APPROVED_PAYMENT_STATUSES } from "@/lib/payment-ledger";
import { getPortalBankConfig } from "@/lib/portal-settings";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  try {
    await requireCapability(["MANAGE_FINANCE", "APPROVE_PAYMENTS"]);
  } catch {
    redirect("/portal/unauthorized?zone=finance");
  }

  const terms = await prisma.academic_Term.findMany({
    orderBy: { SessionName: "desc" },
  });

  const activeTerm = terms.find((t) => t.IsActive) || terms[0] || null;

  const [rawPayments, rawSchedules, pendingCount, approvedTotal, bankConfig, remittanceLogs] =
    await Promise.all([
      prisma.payment_Record.findMany({
        orderBy: { PaymentDate: "desc" },
        include: {
          Student: {
            include: {
              Class: true,
              User: {
                select: { UserID: true, Email: true, IsActive: true },
              },
            },
          },
          Term: true,
          Invoice: { include: { LineItems: true } },
          LedgerEntries: true,
        },
      }),
      ensureAndListFeeSchedules(),
      prisma.payment_Record.count({ where: { Status: "Pending" } }),
      prisma.payment_Record.aggregate({
        where: { Status: { in: [...APPROVED_PAYMENT_STATUSES] } },
        _sum: { AmountPaid: true },
      }),
      getPortalBankConfig(),
      prisma.auditLog.findMany({
        where: { Action: "PROVIDER_REMITTANCE_SETTLED" },
        select: { NewValue: true },
        take: 200,
      }),
    ]);

  const settledLedgerIds = new Set<string>();
  for (const r of remittanceLogs) {
    const val = (r.NewValue || {}) as { ledgerIds?: string[] };
    if (Array.isArray(val.ledgerIds)) {
      for (const id of val.ledgerIds) settledLedgerIds.add(String(id));
    }
  }

  const schedules = rawSchedules.map((s) => ({
    id: s.id,
    levelGroup: s.levelGroup,
    displayName: s.displayName,
    tuitionNaira: s.tuitionNaira,
    leviesNaira: s.leviesNaira,
    maintenanceFeeNaira: s.maintenanceFeeNaira,
    totalNaira: s.totalNaira,
  }));

  const initialPayments = rawPayments.map((p) => {
    const entries = p.LedgerEntries || [];
    let schoolShareNaira = 0;
    let providerShareNaira = 0;
    let principalNaira = Number(p.AmountKobo || 0) / 100 || Number(p.AmountPaid || 0);
    let gatewayFeeNaira = Number(p.gatewayFeeKobo || 0) / 100;

    if (entries.length > 0) {
      let sK = BigInt(0);
      let prK = BigInt(0);
      let gK = BigInt(0);
      let gwK = BigInt(0);
      for (const le of entries) {
        sK += le.schoolShareKobo;
        prK += le.providerShareKobo;
        gK += le.grossPaidKobo;
        gwK += le.gatewayFeeKobo;
      }
      schoolShareNaira = Number(sK) / 100;
      providerShareNaira = Number(prK) / 100;
      principalNaira = Number(gK) / 100;
      gatewayFeeNaira = Number(gwK) / 100;
    } else {
      const principalKobo =
        p.AmountKobo && p.AmountKobo > BigInt(0)
          ? p.AmountKobo
          : BigInt(Math.round((Number(p.AmountPaid) || 0) * 100));
      const sim = allocateTermPaymentKobo({
        grossPrincipalPaidKobo: principalKobo,
        targetPortalFeeKobo: PORTAL_ICT_SERVICE_FEE_KOBO,
      });
      schoolShareNaira = sim.schoolShareNaira;
      providerShareNaira = sim.providerShareNaira;
      principalNaira = sim.grossPrincipalPaidNaira;
    }

    return {
      ...p,
      AmountKobo: p.AmountKobo ? Number(p.AmountKobo) : null,
      gatewayFeeKobo: p.gatewayFeeKobo ? Number(p.gatewayFeeKobo) : 0,
      ReceiptUrl: p.ReceiptUrl || p.receiptStorageKey ? `/api/receipts/${p.PaymentID}` : null,
      Invoice: p.Invoice
        ? {
            ...p.Invoice,
            AmountKobo: Number(p.Invoice.AmountKobo),
            LineItems: p.Invoice.LineItems.map((li) => ({
              ...li,
              amountKobo: Number(li.amountKobo),
            })),
          }
        : null,
      LedgerEntries: entries.map((le) => ({
        ...le,
        grossPaidKobo: Number(le.grossPaidKobo),
        gatewayFeeKobo: Number(le.gatewayFeeKobo),
        schoolShareKobo: Number(le.schoolShareKobo),
        providerShareKobo: Number(le.providerShareKobo),
        isRemitted:
          le.settlementStatus === "AUTO_SPLIT" ||
          le.settlementStatus === "REMITTED" ||
          settledLedgerIds.has(le.id),
      })),
      allocation: {
        principalNaira,
        schoolShareNaira,
        providerShareNaira,
        gatewayFeeNaira,
        hasLedgerEntry: entries.length > 0,
        ledgerIds: entries.map((le) => le.id),
      },
    };
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
            Fee Clearance, Ledger &amp; Receipt Audit
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            100% Tuition to School · ₦800/Student/Term Portal/ICT Service Fee · Gateway Charges Tracked Separately.
          </p>
        </div>
      </div>

      <PaymentsClient
        initialPayments={initialPayments}
        terms={terms}
        activeTerm={activeTerm}
        initialStats={{ pendingCount, totalRevenue: approvedTotal._sum.AmountPaid || 0 }}
        initialSchedules={schedules}
        initialBankConfig={bankConfig}
      />
    </div>
  );
}
