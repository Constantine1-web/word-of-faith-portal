"use client";

import { useState } from "react";
import {
  approvePaymentRecord,
  rejectPaymentRecord,
  getAdminPaymentAuditList,
  updateFeeSchedule,
  updatePortalBankConfigAction,
  recordCashBursaryPayment,
  waiveStudentSchoolFees,
  markProviderRemittanceSettled,
} from "@/app/actions/payments";
import {
  FiCheck,
  FiX,
  FiSearch,
  FiFileText,
  FiImage,
  FiSliders,
  FiSave,
  FiDollarSign,
  FiAward,
  FiSettings,
  FiCheckCircle,
} from "react-icons/fi";

interface BankConfigState {
  bankName: string;
  accountName: string;
  accountNumber: string;
  portalFeeBeneficiary: string;
  tradingAsName: string;
  paystackSubaccountCode: string;
  gatewayFeePolicy: "PAYER_SURCHARGE" | "SCHOOL_ABSORBS";
  supportEmail: string;
  portalBaseUrl: string;
}

export default function PaymentsClient({
  initialPayments,
  terms,
  activeTerm,
  initialStats,
  initialSchedules = [],
  initialBankConfig,
}: {
  initialPayments: any[];
  terms: any[];
  activeTerm: any;
  initialStats: { pendingCount: number; totalRevenue: number };
  initialSchedules?: any[];
  initialBankConfig: BankConfigState;
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [stats, setStats] = useState(initialStats);
  const [schedules, setSchedules] = useState<any[]>(initialSchedules);
  const [bankConfig, setBankConfig] = useState<BankConfigState>(initialBankConfig);

  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [showBankEditor, setShowBankEditor] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showWaiverModal, setShowWaiverModal] = useState(false);

  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);
  const [savingBank, setSavingBank] = useState(false);
  const [bankStepUpCode, setBankStepUpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Accessible Confirmation / Reason Modals (replaces browser native prompt/confirm)
  const [confirmApproveTarget, setConfirmApproveTarget] = useState<{ id: number; studentName: string } | null>(null);
  const [rejectModalTarget, setRejectModalTarget] = useState<{ id: number; studentName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("Receipt could not be verified by Bursary. Please upload a clear teller or transfer receipt.");

  // Cash Bursary Entry State
  const [cashStudentId, setCashStudentId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashReceiptNo, setCashReceiptNo] = useState("");
  const [cashNotes, setCashNotes] = useState("");

  // School Fee Waiver State (Tuition waived while ₦800 ICT Fee remains payable)
  const [waiveStudentId, setWaiveStudentId] = useState("");
  const [waiveMode, setWaiveMode] = useState<"WAIVE" | "UNWAIVE">("WAIVE");
  const [waiveReason, setWaiveReason] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [termFilter, setTermFilter] = useState<string>(activeTerm?.TermID?.toString() || "");

  // Receipt Preview Modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  const approvedPayments = payments.filter((p) => {
    const s = String(p.Status || "").toUpperCase();
    return s === "APPROVED" || s === "SUCCESSFUL";
  });

  const reconciliation = approvedPayments.reduce(
    (acc, p) => {
      const a = p.allocation || {
        principalNaira: Number(p.AmountPaid) || 0,
        schoolShareNaira: Math.max(0, (Number(p.AmountPaid) || 0) - 800),
        providerShareNaira: Number(p.AmountPaid) >= 800 ? 800 : Number(p.AmountPaid) || 0,
        gatewayFeeNaira: 0,
      };
      acc.count += 1;
      acc.principalTotal += Number(a.principalNaira) || 0;
      acc.schoolShareTotal += Number(a.schoolShareNaira) || 0;
      acc.providerShareTotal += Number(a.providerShareNaira) || 0;
      acc.gatewayFeeTotal += Number(a.gatewayFeeNaira) || 0;

      const entries: any[] = p.LedgerEntries || [];
      for (const le of entries) {
        const provN = (Number(le.providerShareKobo) || 0) / 100;
        if (le.isRemitted) {
          acc.providerRemitted += provN;
        } else if (provN > 0) {
          acc.providerPendingRemittance += provN;
          acc.unremittedLedgerIds.push(le.id);
        }
      }
      return acc;
    },
    {
      count: 0,
      principalTotal: 0,
      schoolShareTotal: 0,
      providerShareTotal: 0,
      gatewayFeeTotal: 0,
      providerRemitted: 0,
      providerPendingRemittance: 0,
      unremittedLedgerIds: [] as string[],
    }
  );

  const sanitizeCsv = (val: unknown) => {
    const s = String(val ?? "");
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const handleExportReconciliationCsv = () => {
    const headers = [
      "Reference",
      "Channel",
      "Student Name",
      "WOFS Student ID",
      "Class",
      "Status",
      "Principal Paid (NGN)",
      "School Tuition & Levies (100% School NGN)",
      "Portal / ICT Service Fee (100% Provider NGN)",
      "Gateway Convenience Fee (Separate NGN)",
      "Date",
    ];
    const rows = approvedPayments.map((p) => {
      const a = p.allocation || {};
      return [
        sanitizeCsv(p.Reference || `PAY-${p.PaymentID}`),
        sanitizeCsv(p.Channel || "BANK_TELLER"),
        sanitizeCsv(p.Student?.PreferredName || "Student"),
        sanitizeCsv(p.Student?.AdmissionNo || ""),
        sanitizeCsv(p.Student?.Class?.ClassName || ""),
        sanitizeCsv(p.Status),
        Number(a.principalNaira ?? p.AmountPaid ?? 0),
        Number(a.schoolShareNaira ?? 0),
        Number(a.providerShareNaira ?? 0),
        Number(a.gatewayFeeNaira ?? 0),
        p.PaymentDate ? new Date(p.PaymentDate).toISOString().split("T")[0] : "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WOF_ModelA_ICT_Fee_Reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshList = async () => {
    const termId = termFilter ? parseInt(termFilter, 10) : undefined;
    const res = await getAdminPaymentAuditList({
      status: statusFilter,
      termId,
      search: searchTerm || undefined,
    });
    if (res.success && res.payments) {
      setPayments(res.payments);
      setStats({
        pendingCount: res.pendingCount || 0,
        totalRevenue: res.totalRevenue || 0,
      });
    }
  };

  const executeApprove = async () => {
    if (!confirmApproveTarget) return;
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await approvePaymentRecord(confirmApproveTarget.id);
    const targetName = confirmApproveTarget.studentName;
    setConfirmApproveTarget(null);

    if (res.success) {
      await refreshList();
      setSuccess(`Payment for ${targetName} approved, ledger credited, and clearance synced!`);
    } else {
      setError(res.error || "Failed to approve payment");
    }
    setLoading(false);
  };

  const executeReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalTarget) return;
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await rejectPaymentRecord(rejectModalTarget.id, rejectReason);
    const targetName = rejectModalTarget.studentName;
    setRejectModalTarget(null);

    if (res.success) {
      await refreshList();
      setSuccess(`Payment for ${targetName} rejected & reversed if previously credited.`);
    } else {
      setError(res.error || "Failed to reject payment");
    }
    setLoading(false);
  };

  const handleSaveSchedule = async (sched: any) => {
    setSavingScheduleId(sched.levelGroup);
    setError("");
    setSuccess("");
    const res = await updateFeeSchedule({
      levelGroup: sched.levelGroup,
      displayName: sched.displayName,
      tuitionNaira: Number(sched.tuitionNaira) || 0,
      leviesNaira: Number(sched.leviesNaira) || 0,
      maintenanceFeeNaira: Number(sched.maintenanceFeeNaira) || 0,
    });
    setSavingScheduleId(null);
    if (res.success && res.schedule) {
      setSchedules((prev) =>
        prev.map((s) => (s.levelGroup === sched.levelGroup ? { ...s, ...res.schedule } : s))
      );
      setSuccess(
        `Saved ${res.schedule.displayName} schedule (Total: ₦${res.schedule.totalNaira.toLocaleString()}, incl. ₦${res.schedule.maintenanceFeeNaira.toLocaleString()} Portal/ICT Fee).`
      );
    } else {
      setError(res.error || "Failed to update fee schedule.");
    }
  };

  const handleSaveBankConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBank(true);
    setError("");
    setSuccess("");
    const res = await updatePortalBankConfigAction({
      ...bankConfig,
      stepUpCode: bankStepUpCode.trim() || undefined,
    });
    setSavingBank(false);
    if (res.success && res.config) {
      setBankConfig(res.config);
      setBankStepUpCode("");
      setSuccess("Updated institutional bank account & settlement settings.");
      setShowBankEditor(false);
    } else {
      setError(res.error || "Failed to update bank configuration.");
    }
  };

  const handleRecordCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await recordCashBursaryPayment({
      studentAdmissionOrId: cashStudentId,
      termId: termFilter ? parseInt(termFilter, 10) : activeTerm?.TermID,
      amountNaira: Number(cashAmount),
      receiptNo: cashReceiptNo || undefined,
      notes: cashNotes || undefined,
    });
    setLoading(false);
    if (res.success) {
      setShowCashModal(false);
      setCashStudentId("");
      setCashAmount("");
      setCashReceiptNo("");
      setCashNotes("");
      await refreshList();
      setSuccess(`Cash Bursary receipt (${res.reference}) recorded and allocated!`);
    } else {
      setError(res.error || "Failed to record cash payment");
    }
  };

  const handleSaveWaiver = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await waiveStudentSchoolFees({
      studentAdmissionOrId: waiveStudentId,
      termId: termFilter ? parseInt(termFilter, 10) : activeTerm?.TermID,
      isWaived: waiveMode === "WAIVE",
      reason: waiveReason,
    });
    setLoading(false);
    if (res.success) {
      setShowWaiverModal(false);
      setWaiveStudentId("");
      setWaiveReason("");
      await refreshList();
      setSuccess(res.message || "Updated waiver status.");
    } else {
      setError(res.error || "Failed to update fee waiver.");
    }
  };

  const handleMarkRemitted = async () => {
    if (reconciliation.unremittedLedgerIds.length === 0) return;
    setLoading(true);
    const res = await markProviderRemittanceSettled(
      reconciliation.unremittedLedgerIds,
      `Remittance confirmed by Bursar (${reconciliation.unremittedLedgerIds.length} entries)`
    );
    setLoading(false);
    if (res.success) {
      await refreshList();
      setSuccess(`Marked ${res.count} Portal/ICT Fee ledger entries as remitted.`);
    } else {
      setError(res.error || "Failed to record remittance.");
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    await refreshList();
    setLoading(false);
  };

  return (
    <div>
      {error && (
        <div style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>
          {success}
        </div>
      )}

      {/* Summary Cards (Model A — Distinct Line Items) */}
      <div className="responsive-grid" style={{ marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--status-warning-border)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Pending Audit Queue</p>
          <h2 style={{ color: "var(--status-warning-text)", margin: 0 }}>{stats.pendingCount} Pending</h2>
        </div>

        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--brand-primary)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Total Settled Principal</p>
          <h2 style={{ color: "var(--status-success-text)", margin: 0 }}>₦{reconciliation.principalTotal.toLocaleString()}</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {reconciliation.count} verified transaction{reconciliation.count === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--accent-blue)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>100% School Fees (Tuition &amp; Levies)</p>
          <h2 style={{ color: "var(--accent-blue)", margin: 0 }}>₦{reconciliation.schoolShareTotal.toLocaleString()}</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            100% retained by Word of Faith Schools
          </span>
        </div>

        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--accent-purple)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Portal/ICT Service Fee (₦800/Term)</p>
          <h2 style={{ color: "var(--text-heading)", margin: 0, fontSize: "1.25rem" }}>
            ₦{reconciliation.providerShareTotal.toLocaleString()}
          </h2>
          <span style={{ fontSize: "0.78rem", color: "var(--status-success-text)", fontWeight: 700 }}>
            100% {bankConfig.portalFeeBeneficiary} · Unremitted: ₦{reconciliation.providerPendingRemittance.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Model A Rule & Bursar Controls Bar */}
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <strong style={{ color: "var(--text-heading)", fontSize: "0.95rem", display: "block" }}>
            Model A Ledger Rule (₦800/Student/Term Portal ICT Fee · 100% Tuition to School)
          </strong>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
            Payable once per student/term (first installment on partial payments; non-exempt under School tuition waivers). Paystack fee borne by payer: ₦{reconciliation.gatewayFeeTotal.toLocaleString()} tracked separately.
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setShowCashModal(true)} className="btn btn-outline" style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem", minHeight: "38px" }}>
            <FiDollarSign /> Cash Receipt
          </button>
          <button type="button" onClick={() => setShowWaiverModal(true)} className="btn btn-outline" style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem", minHeight: "38px" }}>
            <FiAward /> Tuition Waiver
          </button>
          <button type="button" onClick={() => setShowScheduleEditor((v) => !v)} className="btn btn-outline" style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem", minHeight: "38px" }}>
            <FiSliders /> {showScheduleEditor ? "Hide Schedules" : "Fee Schedules"}
          </button>
          <button type="button" onClick={() => setShowBankEditor((v) => !v)} className="btn btn-outline" style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem", minHeight: "38px" }}>
            <FiSettings /> Bank Settings
          </button>
          {reconciliation.unremittedLedgerIds.length > 0 && (
            <button type="button" onClick={handleMarkRemitted} disabled={loading} className="btn btn-outline" style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem", minHeight: "38px" }}>
              <FiCheckCircle /> Mark ₦{reconciliation.providerPendingRemittance.toLocaleString()} Remitted
            </button>
          )}
          <button type="button" onClick={handleExportReconciliationCsv} className="btn btn-primary" style={{ padding: "0.45rem 0.95rem", fontSize: "0.82rem", minHeight: "38px" }}>
            <FiFileText /> Export Ledger CSV
          </button>
        </div>
      </div>

      {/* Bank Settings Editor */}
      {showBankEditor && (
        <form
          onSubmit={handleSaveBankConfig}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1.25rem",
            marginBottom: "1.75rem",
            boxShadow: "var(--shadow-sm)",
            display: "grid",
            gap: "1rem",
          }}
        >
          <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "1.05rem" }}>
            Official School Bank &amp; Paystack Subaccount Settings
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
            <div>
              <label className="form-label">Bank Name</label>
              <input className="form-input" value={bankConfig.bankName} onChange={(e) => setBankConfig({ ...bankConfig, bankName: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">School Account Name</label>
              <input className="form-input" value={bankConfig.accountName} onChange={(e) => setBankConfig({ ...bankConfig, accountName: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">NUBAN Account Number</label>
              <input className="form-input" value={bankConfig.accountNumber} onChange={(e) => setBankConfig({ ...bankConfig, accountNumber: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Paystack Provider Subaccount Code (Optional)</label>
              <input className="form-input" placeholder="e.g. ACCT_xxxxxxxx" value={bankConfig.paystackSubaccountCode} onChange={(e) => setBankConfig({ ...bankConfig, paystackSubaccountCode: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Paystack Gateway Fee Policy</label>
              <select
                className="form-input"
                value={bankConfig.gatewayFeePolicy}
                onChange={(e) =>
                  setBankConfig({
                    ...bankConfig,
                    gatewayFeePolicy:
                      e.target.value === "SCHOOL_ABSORBS" ? "SCHOOL_ABSORBS" : "PAYER_SURCHARGE",
                  })
                }
              >
                <option value="PAYER_SURCHARGE">Option A: Payer Convenience Pass-Through</option>
                <option value="SCHOOL_ABSORBS">School Absorbs Merchant Gateway Fee</option>
              </select>
            </div>
            <div>
              <label className="form-label">Portal/ICT Fee Legal Beneficiary</label>
              <input className="form-input" value={bankConfig.portalFeeBeneficiary} onChange={(e) => setBankConfig({ ...bankConfig, portalFeeBeneficiary: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">Portal Base URL</label>
              <input className="form-input" value={bankConfig.portalBaseUrl} onChange={(e) => setBankConfig({ ...bankConfig, portalBaseUrl: e.target.value })} required />
            </div>
            <div>
              <label className="form-label">2FA Authenticator Code (Required if 2FA Enabled)</label>
              <input
                className="form-input"
                placeholder="6-digit TOTP code"
                value={bankStepUpCode}
                onChange={(e) => setBankStepUpCode(e.target.value)}
                maxLength={8}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem" }}>
            <button type="button" onClick={() => setShowBankEditor(false)} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={savingBank} className="btn btn-primary"><FiSave /> {savingBank ? "Saving..." : "Save Bank Config"}</button>
          </div>
        </form>
      )}

      {/* Per-Class Level Termly Fee Schedule Builder */}
      {showScheduleEditor && schedules.length > 0 && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1.25rem",
            marginBottom: "1.75rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "1.08rem" }}>
              Per-Level School Fee Schedule &amp; Portal/ICT Service Fee (₦800)
            </h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
              Customize Tuition, Books/Levies (100% School), and the separate Portal/ICT Service Fee (100% Provider, once per student/term).
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "700px" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-primary)" }}>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>School Section</th>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>Tuition (₦)</th>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>Books / Levies (₦)</th>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>Portal/ICT Service Fee (₦)</th>
                  <th style={{ padding: "0.7rem", textAlign: "right" }}>Total Billed (₦)</th>
                  <th style={{ padding: "0.7rem", textAlign: "right" }}>Save</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const rowTotal =
                    (Number(s.tuitionNaira) || 0) +
                    (Number(s.leviesNaira) || 0) +
                    (Number(s.maintenanceFeeNaira) || 0);
                  return (
                    <tr key={s.levelGroup} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.7rem", fontWeight: 700, color: "var(--text-heading)" }}>{s.displayName}</td>
                      <td style={{ padding: "0.55rem 0.7rem" }}>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          className="form-input"
                          style={{ width: "120px", padding: "0.35rem 0.5rem" }}
                          value={s.tuitionNaira}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item) =>
                                item.levelGroup === s.levelGroup
                                  ? { ...item, tuitionNaira: parseInt(e.target.value, 10) || 0 }
                                  : item
                              )
                            )
                          }
                        />
                      </td>
                      <td style={{ padding: "0.55rem 0.7rem" }}>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          className="form-input"
                          style={{ width: "115px", padding: "0.35rem 0.5rem" }}
                          value={s.leviesNaira}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item) =>
                                item.levelGroup === s.levelGroup
                                  ? { ...item, leviesNaira: parseInt(e.target.value, 10) || 0 }
                                  : item
                              )
                            )
                          }
                        />
                      </td>
                      <td style={{ padding: "0.55rem 0.7rem" }}>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          className="form-input"
                          style={{ width: "110px", padding: "0.35rem 0.5rem" }}
                          value={s.maintenanceFeeNaira}
                          onChange={(e) =>
                            setSchedules((prev) =>
                              prev.map((item) =>
                                item.levelGroup === s.levelGroup
                                  ? { ...item, maintenanceFeeNaira: parseInt(e.target.value, 10) || 0 }
                                  : item
                              )
                            )
                          }
                        />
                      </td>
                      <td style={{ padding: "0.7rem", textAlign: "right", fontWeight: 800, color: "var(--status-success-text)" }}>
                        ₦{rowTotal.toLocaleString()}
                      </td>
                      <td style={{ padding: "0.7rem", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => handleSaveSchedule(s)}
                          disabled={savingScheduleId === s.levelGroup}
                          className="btn btn-primary"
                          style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem", minHeight: "34px" }}
                        >
                          <FiSave /> {savingScheduleId === s.levelGroup ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "min(100%, 280px)", maxWidth: "700px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-400)" }} />
            <input
              type="text"
              placeholder="Search reference, student name, or WOFS ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFilter()}
              className="form-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-input" style={{ width: "auto", minWidth: "140px" }}>
            <option value="ALL">All Status</option>
            <option value="Pending">Pending Audit</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Refunded">Refunded</option>
            <option value="Disputed">Disputed</option>
          </select>

          <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className="form-input" style={{ width: "auto", minWidth: "150px" }}>
            <option value="">All Terms</option>
            {terms.map((t) => (
              <option key={t.TermID} value={t.TermID.toString()}>
                {t.SessionName} - {t.TermName}
              </option>
            ))}
          </select>

          <button onClick={handleFilter} className="btn btn-outline" style={{ padding: "0.5rem 1rem" }}>
            Filter
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>Student &amp; Class</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Description &amp; Channel</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Allocation (NGN)</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Reference / Receipt</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No payment records found matching your filters.
                </td>
              </tr>
            ) : (
              payments.map((p) => {
                const statusUpper = String(p.Status || "").toUpperCase();
                const isApproved = statusUpper === "APPROVED" || statusUpper === "SUCCESSFUL";
                const a = p.allocation || {
                  principalNaira: Number(p.AmountPaid) || 0,
                  schoolShareNaira: 0,
                  providerShareNaira: 0,
                  gatewayFeeNaira: 0,
                };
                return (
                  <tr key={p.PaymentID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                    <td data-label="Student" style={{ padding: "1rem" }}>
                      <div style={{ fontWeight: "600", color: "var(--color-navy-blue)" }}>
                        {p.Student?.PreferredName || "Unknown Student"}
                      </div>
                      <div style={{ color: "var(--color-gray-500)", fontSize: "0.85rem" }}>
                        {p.Student?.AdmissionNo} · {p.Student?.Class?.ClassName}
                      </div>
                    </td>

                    <td data-label="Description" style={{ padding: "1rem" }}>
                      <div style={{ fontWeight: "500", color: "var(--color-gray-800)" }}>{p.Description}</div>
                      <div style={{ color: "var(--color-gray-500)", fontSize: "0.8rem" }}>
                        {p.Channel || "BANK_TELLER"} · {p.Term ? `${p.Term.SessionName} (${p.Term.TermName})` : "General"}
                      </div>
                    </td>

                    <td data-label="Amount" style={{ padding: "1rem" }}>
                      <div style={{ fontWeight: "bold", color: "var(--color-primary-green)" }}>
                        ₦{Number(a.principalNaira ?? p.AmountPaid ?? 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                        School: ₦{Number(a.schoolShareNaira || 0).toLocaleString()} · Portal ICT: ₦{Number(a.providerShareNaira || 0).toLocaleString()}
                        {Number(a.gatewayFeeNaira || 0) > 0 && ` · Gateway: ₦${Number(a.gatewayFeeNaira).toLocaleString()}`}
                      </div>
                    </td>

                    <td data-label="Receipt / Reference" style={{ padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--color-gray-600)", marginBottom: "0.25rem" }}>
                        {p.Reference || "Direct Record"}
                      </div>
                      {p.ReceiptUrl ? (
                        <button
                          onClick={() => setPreviewReceiptUrl(p.ReceiptUrl)}
                          className="btn"
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "var(--status-info-bg)", color: "var(--status-info-text)", border: "1px solid var(--status-info-border)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          <FiImage /> View Private Receipt
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.Channel || "Gateway"}</span>
                      )}
                    </td>

                    <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          background: isApproved ? "var(--status-success-bg)" : statusUpper === "PENDING" ? "var(--status-warning-bg)" : "var(--status-error-bg)",
                          color: isApproved ? "var(--status-success-text)" : statusUpper === "PENDING" ? "var(--status-warning-text)" : "var(--status-error-text)",
                        }}
                      >
                        {p.Status}
                      </span>
                    </td>

                    <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        {!isApproved && statusUpper !== "REFUNDED" && statusUpper !== "DISPUTED" && (
                          <button
                            onClick={() =>
                              setConfirmApproveTarget({
                                id: p.PaymentID,
                                studentName: p.Student?.PreferredName || p.Student?.AdmissionNo || "Student",
                              })
                            }
                            disabled={loading}
                            className="btn"
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", display: "flex", alignItems: "center", gap: "0.25rem" }}
                            title="Approve & Credit Ledger"
                          >
                            <FiCheck /> Approve
                          </button>
                        )}
                        {statusUpper !== "REJECTED" && statusUpper !== "REFUNDED" && statusUpper !== "DISPUTED" && (
                          <button
                            onClick={() =>
                              setRejectModalTarget({
                                id: p.PaymentID,
                                studentName: p.Student?.PreferredName || p.Student?.AdmissionNo || "Student",
                              })
                            }
                            disabled={loading}
                            className="btn"
                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", display: "flex", alignItems: "center", gap: "0.25rem" }}
                            title={isApproved ? "Revert Approval & Reject" : "Reject Payment"}
                          >
                            <FiX /> {isApproved ? "Reverse" : "Reject"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm Approve Modal */}
      {confirmApproveTarget && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card" style={{ padding: "1.5rem", maxWidth: "460px" }}>
            <h3 style={{ margin: "0 0 0.5rem", color: "var(--text-heading)" }}>Confirm Payment Approval</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", lineHeight: 1.5 }}>
              Approve fee payment for <strong>{confirmApproveTarget.studentName}</strong>? This records an immutable credit in the Model A ₦800 ledger and updates active-term fee clearance.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem", marginTop: "1.25rem" }}>
              <button type="button" onClick={() => setConfirmApproveTarget(null)} className="btn btn-outline">Cancel</button>
              <button type="button" onClick={executeApprove} disabled={loading} className="btn btn-primary">
                <FiCheck /> {loading ? "Approving..." : "Confirm & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject / Reverse Reason Modal */}
      {rejectModalTarget && (
        <div className="portal-modal-overlay">
          <form onSubmit={executeReject} className="portal-modal-card" style={{ padding: "1.5rem", maxWidth: "480px" }}>
            <h3 style={{ margin: "0 0 0.5rem", color: "var(--text-heading)" }}>
              Reject / Reverse Payment — {rejectModalTarget.studentName}
            </h3>
            <label className="form-label">Reason (sent to Parent/Student via Email)</label>
            <textarea
              className="form-input"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              required
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem", marginTop: "1.25rem" }}>
              <button type="button" onClick={() => setRejectModalTarget(null)} className="btn btn-outline">Cancel</button>
              <button type="submit" disabled={loading} className="btn" style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)" }}>
                <FiX /> {loading ? "Submitting..." : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Cash Payment Modal */}
      {showCashModal && (
        <div className="portal-modal-overlay">
          <form onSubmit={handleRecordCash} className="portal-modal-card" style={{ padding: "1.5rem", maxWidth: "480px", display: "grid", gap: "0.9rem" }}>
            <h3 style={{ margin: 0, color: "var(--text-heading)" }}>Record Cash-at-Bursary Payment</h3>
            <div>
              <label className="form-label">Student WOFS ID or Numeric Student ID *</label>
              <input className="form-input" placeholder="e.g. WOFS-STU-2026-000001" value={cashStudentId} onChange={(e) => setCashStudentId(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Cash Amount Received (₦) *</label>
              <input type="number" min={100} step={100} className="form-input" placeholder="e.g. 64800" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Physical Receipt Number (Optional)</label>
              <input className="form-input" placeholder="Auto-generated if left blank" value={cashReceiptNo} onChange={(e) => setCashReceiptNo(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Notes (Optional)</label>
              <input className="form-input" placeholder="e.g. 1st Installment Cash Receipt" value={cashNotes} onChange={(e) => setCashNotes(e.target.value)} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem" }}>
              <button type="button" onClick={() => setShowCashModal(false)} className="btn btn-outline">Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary">Record &amp; Allocate</button>
            </div>
          </form>
        </div>
      )}

      {/* Tuition Waiver Modal */}
      {showWaiverModal && (
        <div className="portal-modal-overlay">
          <form onSubmit={handleSaveWaiver} className="portal-modal-card" style={{ padding: "1.5rem", maxWidth: "480px", display: "grid", gap: "0.9rem" }}>
            <h3 style={{ margin: 0, color: "var(--text-heading)" }}>School Tuition Waiver / Scholarship</h3>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>
              Waiving Tuition &amp; School Levies sets School charges to ₦0. Per institutional policy, the ₦800 Portal/ICT Service Fee remains payable once per term.
            </p>
            <div>
              <label className="form-label">Student WOFS ID or Student ID *</label>
              <input className="form-input" placeholder="e.g. WOFS-STU-2026-000001" value={waiveStudentId} onChange={(e) => setWaiveStudentId(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Action</label>
              <select className="form-input" value={waiveMode} onChange={(e) => setWaiveMode(e.target.value as "WAIVE" | "UNWAIVE")}>
                <option value="WAIVE">Apply 100% Tuition/Levies Waiver (Retain ₦800 ICT Fee)</option>
                <option value="UNWAIVE">Restore Full Tuition/Levies Billing</option>
              </select>
            </div>
            <div>
              <label className="form-label">Authorized Reason *</label>
              <input className="form-input" placeholder="e.g. Proprietor Full Merit Scholarship" value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} required />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem" }}>
              <button type="button" onClick={() => setShowWaiverModal(false)} className="btn btn-outline">Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary">Update Waiver</button>
            </div>
          </form>
        </div>
      )}

      {/* Private Receipt Preview Modal */}
      {previewReceiptUrl && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card" style={{ padding: "1.5rem", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border-primary)", paddingBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, color: "var(--text-heading)" }}>Protected Bank Receipt Preview</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <a href={previewReceiptUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem", color: "var(--brand-primary)", textDecoration: "underline" }}>
                  Open / Download File
                </a>
                <button onClick={() => setPreviewReceiptUrl(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>
                  <FiX size={20} />
                </button>
              </div>
            </div>

            <iframe
              src={previewReceiptUrl}
              title="Payment Receipt Preview"
              style={{ width: "100%", height: "500px", border: "1px solid var(--color-gray-300)", borderRadius: "var(--radius-md)", background: "#ffffff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
