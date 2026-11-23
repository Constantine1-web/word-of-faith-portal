"use client";

import { useState } from "react";
import {
  approvePaymentRecord,
  rejectPaymentRecord,
  getAdminPaymentAuditList,
  updateFeeSchedule,
} from "@/app/actions/payments";
import { FiCheck, FiX, FiSearch, FiDollarSign, FiClock, FiFileText, FiImage, FiSliders, FiSave } from "react-icons/fi";

export default function PaymentsClient({
  initialPayments,
  terms,
  activeTerm,
  initialStats,
  initialSchedules = [],
}: {
  initialPayments: any[];
  terms: any[];
  activeTerm: any;
  initialStats: { pendingCount: number; totalRevenue: number };
  initialSchedules?: any[];
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [stats, setStats] = useState(initialStats);
  const [schedules, setSchedules] = useState<any[]>(initialSchedules);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [termFilter, setTermFilter] = useState<string>(activeTerm?.TermID?.toString() || "");

  // Receipt Preview Modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  // Optional flat-rate simulation override; null = automatically use each student's configured class FeeSchedule
  const [customRateOverride, setCustomRateOverride] = useState<number | null>(null);

  const resolveLevelGroupForPayment = (className?: string | null, level?: string | null) => {
    const combined = `${className || ""} ${level || ""}`.toLowerCase();
    if (
      combined.includes("creche") ||
      combined.includes("nursery") ||
      combined.includes("pre-nursery") ||
      combined.includes("kg")
    ) {
      return "CRECHE_NURSERY";
    }
    if (combined.includes("primary") || combined.includes("basic")) {
      return "PRIMARY";
    }
    if ((combined.includes("ss") && !combined.includes("jss")) || combined.includes("senior")) {
      return "SSS";
    }
    return "JSS";
  };

  const scheduleRateByGroup = new Map<string, number>(
    schedules.map((s) => [s.levelGroup, Math.max(0, Number(s.maintenanceFeeNaira) || 0)])
  );

  const uniqueScheduleRates = Array.from(new Set(scheduleRateByGroup.values()));
  const uniformScheduleRate = uniqueScheduleRates.length === 1 ? uniqueScheduleRates[0] : null;

  const getPaymentAllocation = (p: {
    AmountPaid?: number | null;
    Student?: { Class?: { ClassName?: string | null; Level?: string | null } | null } | null;
    allocation?: { maintenanceFee?: number } | null;
  }) => {
    const gross = Math.max(0, Number(p.AmountPaid) || 0);
    let rate: number;
    if (customRateOverride !== null) {
      rate = Math.max(0, customRateOverride);
    } else {
      const grp = resolveLevelGroupForPayment(p.Student?.Class?.ClassName, p.Student?.Class?.Level);
      if (scheduleRateByGroup.has(grp)) {
        rate = scheduleRateByGroup.get(grp) as number;
      } else if (typeof p.allocation?.maintenanceFee === "number") {
        rate = Math.max(0, p.allocation.maintenanceFee);
      } else {
        rate = 1000;
      }
    }
    const maint = gross >= rate ? rate : 0;
    const tuition = Math.max(0, gross - maint);
    const provider80 = Math.round(maint * 0.8);
    const school20 = maint - provider80;
    return { gross, rate, maint, tuition, provider80, school20 };
  };

  // Compute live 80% / 20% Portal Maintenance / ICT Fee reconciliation from Approved payments
  const approvedPayments = payments.filter(
    (p) => p.Status === "Approved" || p.Status === "Successful"
  );
  const reconciliation = approvedPayments.reduce(
    (acc, p) => {
      const { gross, maint, tuition, provider80, school20 } = getPaymentAllocation(p);
      acc.count += 1;
      acc.grossTotal += gross;
      acc.tuitionTotal100 += tuition;
      acc.maintenancePool += maint;
      acc.providerShare80 += provider80;
      acc.schoolMaintenanceShare20 += school20;
      return acc;
    },
    {
      count: 0,
      grossTotal: 0,
      tuitionTotal100: 0,
      maintenancePool: 0,
      providerShare80: 0,
      schoolMaintenanceShare20: 0,
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
      "Student Name",
      "WOFS Student ID",
      "Class",
      "Status",
      "Gross Amount Paid (NGN)",
      "School Tuition & Levies 100% (NGN)",
      "Portal Maintenance / ICT Fee (NGN)",
      "Service Provider 80% Share (NGN)",
      "School 20% Maintenance Share (NGN)",
      "Date",
    ];
    const rows = approvedPayments.map((p) => {
      const { gross, maint, tuition, provider80, school20 } = getPaymentAllocation(p);
      return [
        sanitizeCsv(p.Reference || `PAY-${p.PaymentID}`),
        sanitizeCsv(p.Student?.PreferredName || "Student"),
        sanitizeCsv(p.Student?.AdmissionNo || ""),
        sanitizeCsv(p.Student?.Class?.ClassName || ""),
        sanitizeCsv(p.Status),
        gross,
        tuition,
        maint,
        provider80,
        school20,
        p.PaymentDate ? new Date(p.PaymentDate).toISOString().split("T")[0] : "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WOF_Maintenance_Split_Reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApprove = async (paymentId: number, studentName: string) => {
    if (!confirm(`Approve fee payment for ${studentName}? This will grant fee clearance for result checking.`)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await approvePaymentRecord(paymentId);
    if (res.success) {
      setPayments(prev => prev.map(p => p.PaymentID === paymentId ? { ...p, Status: "Approved" } : p));
      setSuccess(`Payment for ${studentName} approved and fee clearance granted!`);
      setStats(prev => ({
        ...prev,
        pendingCount: Math.max(0, prev.pendingCount - 1)
      }));
    } else {
      setError(res.error || "Failed to approve payment");
    }
    setLoading(false);
  };

  const handleReject = async (paymentId: number, studentName: string) => {
    const reason = prompt(`Enter reason for rejecting fee payment for ${studentName}:`, "Receipt could not be verified by Bursary. Please upload a clear teller or transfer receipt.");
    if (reason === null) return; // User clicked Cancel

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await rejectPaymentRecord(paymentId, reason);
    if (res.success) {
      setPayments(prev => prev.map(p => p.PaymentID === paymentId ? { ...p, Status: "Rejected", RejectionReason: reason } : p));
      setSuccess(`Payment for ${studentName} rejected.`);
      setStats(prev => ({
        ...prev,
        pendingCount: Math.max(0, prev.pendingCount - 1)
      }));
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
        `Saved ${res.schedule.displayName} schedule (Total: ₦${res.schedule.totalNaira.toLocaleString()}, incl. ₦${res.schedule.maintenanceFeeNaira.toLocaleString()} ICT Fee).`
      );
    } else {
      setError(res.error || "Failed to update fee schedule.");
    }
  };

  const handleFilter = async () => {
    setLoading(true);
    const termId = termFilter ? parseInt(termFilter) : undefined;
    const res = await getAdminPaymentAuditList({
      status: statusFilter,
      termId,
      search: searchTerm || undefined
    });
    if (res.success && res.payments) {
      setPayments(res.payments);
      setStats({
        pendingCount: res.pendingCount || 0,
        totalRevenue: res.totalRevenue || 0
      });
    }
    setLoading(false);
  };

  return (
    <div>
      {error && <div style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Summary Cards */}
      <div className="responsive-grid" style={{ marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--status-warning-border)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Pending Audit Queue</p>
          <h2 style={{ color: "var(--status-warning-text)", margin: 0 }}>{stats.pendingCount} Pending</h2>
        </div>
        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--brand-primary)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Total Approved Gross Revenue</p>
          <h2 style={{ color: "var(--status-success-text)", margin: 0 }}>₦{reconciliation.grossTotal.toLocaleString()}</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            100% School Tuition &amp; Levies: ₦{reconciliation.tuitionTotal100.toLocaleString()}
          </span>
        </div>
        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--accent-blue)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Portal Maintenance / ICT Pool</p>
          <h2 style={{ color: "var(--accent-blue)", margin: 0 }}>₦{reconciliation.maintenancePool.toLocaleString()}</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {customRateOverride !== null
              ? `${reconciliation.count} approved × ₦${customRateOverride.toLocaleString()} (override)`
              : uniformScheduleRate !== null
              ? `${reconciliation.count} approved × ₦${uniformScheduleRate.toLocaleString()}/student`
              : `${reconciliation.count} approved · per-section Fee Schedules`}
          </span>
        </div>
        <div style={{ background: "var(--bg-card)", padding: "1.25rem 1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-primary)", borderLeft: "4px solid var(--accent-purple)" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.85rem" }}>Maintenance Split (80% / 20%)</p>
          <h2 style={{ color: "var(--text-heading)", margin: 0, fontSize: "1.25rem" }}>
            80%: ₦{reconciliation.providerShare80.toLocaleString()}
          </h2>
          <span style={{ fontSize: "0.8rem", color: "var(--status-success-text)", fontWeight: 700 }}>
            20% School Share: ₦{reconciliation.schoolMaintenanceShare20.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Portal Maintenance / ICT Fee Revenue-Sharing Control & Export Bar */}
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        borderRadius: "var(--radius-md)",
        padding: "1rem 1.25rem",
        marginBottom: "1.75rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem"
      }}>
        <div>
          <strong style={{ color: "var(--text-heading)", fontSize: "0.95rem", display: "block" }}>
            Automated Portal Maintenance / ICT Fee Allocation Ledger (80% Provider / 20% School)
          </strong>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
            {customRateOverride !== null
              ? `Simulating flat override of ₦${customRateOverride.toLocaleString()} per payment. Tuition remains 100% School revenue.`
              : uniformScheduleRate !== null
              ? `Synced to configured Fee Schedules (₦${uniformScheduleRate.toLocaleString()} per payment). Tuition remains 100% School revenue.`
              : `Synced per student to configured section Fee Schedules (Creche–SSS). Tuition remains 100% School revenue.`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-label)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            Rate Override (₦):
            <input
              type="number"
              min={0}
              step={100}
              placeholder="Auto"
              value={customRateOverride === null ? "" : customRateOverride}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setCustomRateOverride(raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0));
              }}
              className="form-input"
              style={{ width: "105px", padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
            />
          </label>
          {customRateOverride !== null && (
            <button
              type="button"
              onClick={() => setCustomRateOverride(null)}
              className="btn btn-outline"
              style={{ padding: "0.35rem 0.65rem", fontSize: "0.78rem", minHeight: "34px" }}
            >
              Use Schedules
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowScheduleEditor((v) => !v)}
            className="btn btn-outline"
            style={{ padding: "0.45rem 0.95rem", fontSize: "0.82rem", minHeight: "38px" }}
          >
            <FiSliders /> {showScheduleEditor ? "Hide Fee Schedules" : "Configure Class Fee Schedules"}
          </button>
          <button
            type="button"
            onClick={handleExportReconciliationCsv}
            className="btn btn-primary"
            style={{ padding: "0.45rem 0.95rem", fontSize: "0.82rem", minHeight: "38px" }}
          >
            <FiFileText /> Export 80/20 Split CSV
          </button>
        </div>
      </div>

      {/* Per-Class Level Termly Fee Schedule Builder (Option C) */}
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
              Per-Level School Fee Schedule &amp; Portal Maintenance / ICT Fee
            </h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
              Customize Tuition, Levies, and the separate Portal Maintenance / ICT Fee (80% Provider / 20% School) for each school section. Unpaid fee orders update automatically.
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "700px" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-primary)" }}>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>School Section</th>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>Tuition (₦)</th>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>Books / Levies (₦)</th>
                  <th style={{ padding: "0.7rem", textAlign: "left" }}>Maintenance / ICT Fee (₦)</th>
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
                      <td style={{ padding: "0.7rem", fontWeight: 700, color: "var(--text-heading)" }}>
                        {s.displayName}
                      </td>
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
                                  ? {
                                      ...item,
                                      maintenanceFeeNaira: parseInt(e.target.value, 10) || 0,
                                    }
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

      {/* Control & Filter Bar */}
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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "140px" }}
          >
            <option value="ALL">All Status</option>
            <option value="Pending">Pending Audit</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "150px" }}
          >
            <option value="">All Terms</option>
            {terms.map(t => (
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
              <th style={{ padding: "1rem", textAlign: "left" }}>Student & Class</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Description & Term</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Amount (NGN)</th>
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
              payments.map((p) => (
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
                    <div style={{ fontWeight: "500", color: "var(--color-gray-800)" }}>
                      {p.Description}
                    </div>
                    <div style={{ color: "var(--color-gray-500)", fontSize: "0.8rem" }}>
                      {p.Term ? `${p.Term.SessionName} (${p.Term.TermName})` : "General"}
                    </div>
                  </td>

                  <td data-label="Amount" style={{ padding: "1rem" }}>
                    <div style={{ fontWeight: "bold", color: "var(--color-primary-green)" }}>
                      ₦{p.AmountPaid?.toLocaleString()}
                    </div>
                    {(() => {
                      const rowAlloc = getPaymentAllocation(p);
                      if (rowAlloc.maint <= 0) return null;
                      return (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                          Tuition: ₦{rowAlloc.tuition.toLocaleString()} · ICT: ₦{rowAlloc.maint.toLocaleString()} (80%: ₦{rowAlloc.provider80.toLocaleString()} | 20%: ₦{rowAlloc.school20.toLocaleString()})
                        </div>
                      );
                    })()}
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
                        <FiImage /> View Receipt
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Online Gateway</span>
                    )}
                  </td>

                  <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                    <span style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      background: p.Status === "Approved" || p.Status === "Successful" ? "var(--status-success-bg)" : p.Status === "Pending" ? "var(--status-warning-bg)" : "var(--status-error-bg)",
                      color: p.Status === "Approved" || p.Status === "Successful" ? "var(--status-success-text)" : p.Status === "Pending" ? "var(--status-warning-text)" : "var(--status-error-text)"
                    }}>
                      {p.Status}
                    </span>
                  </td>

                  <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                      {p.Status !== "Approved" && (
                        <button
                          onClick={() => handleApprove(p.PaymentID, p.Student?.PreferredName || p.Student?.AdmissionNo)}
                          disabled={loading}
                          className="btn"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", display: "flex", alignItems: "center", gap: "0.25rem" }}
                          title="Approve & Grant Fee Clearance"
                        >
                          <FiCheck /> Approve
                        </button>
                      )}
                      {p.Status !== "Rejected" && (
                        <button
                          onClick={() => handleReject(p.PaymentID, p.Student?.PreferredName || p.Student?.AdmissionNo)}
                          disabled={loading}
                          className="btn"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", display: "flex", alignItems: "center", gap: "0.25rem" }}
                          title="Reject Payment"
                        >
                          <FiX /> Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Receipt Image / PDF Preview Modal */}
      {previewReceiptUrl && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card" style={{ padding: "1.5rem", maxWidth: "680px", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid var(--border-primary)", paddingBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, color: "var(--text-heading)" }}>Bank Transfer Receipt Preview</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <a href={previewReceiptUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.85rem", color: "var(--brand-primary)", textDecoration: "underline" }}>
                  Open Full File
                </a>
                <button onClick={() => setPreviewReceiptUrl(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>
                  <FiX size={20} />
                </button>
              </div>
            </div>

            {previewReceiptUrl.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={previewReceiptUrl}
                title="Receipt PDF"
                style={{ width: "100%", height: "500px", border: "1px solid var(--color-gray-300)", borderRadius: "var(--radius-md)" }}
              />
            ) : (
              <img
                src={previewReceiptUrl}
                alt="Payment Receipt"
                style={{ width: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", maxHeight: "70vh", objectFit: "contain" }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
