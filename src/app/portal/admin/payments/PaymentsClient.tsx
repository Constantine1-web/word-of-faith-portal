"use client";

import { useState } from "react";
import { approvePaymentRecord, rejectPaymentRecord, getAdminPaymentAuditList } from "@/app/actions/payments";
import { FiCheck, FiX, FiSearch, FiDollarSign, FiClock, FiFileText, FiImage } from "react-icons/fi";

export default function PaymentsClient({
  initialPayments,
  terms,
  activeTerm,
  initialStats
}: {
  initialPayments: any[];
  terms: any[];
  activeTerm: any;
  initialStats: { pendingCount: number; totalRevenue: number };
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [termFilter, setTermFilter] = useState<string>(activeTerm?.TermID?.toString() || "");

  // Receipt Preview Modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

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
    if (!confirm(`Reject fee payment for ${studentName}?`)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await rejectPaymentRecord(paymentId);
    if (res.success) {
      setPayments(prev => prev.map(p => p.PaymentID === paymentId ? { ...p, Status: "Rejected" } : p));
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
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Summary Cards */}
      <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #f59e0b" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Pending Audit Queue</p>
          <h2 style={{ color: "#d97706", margin: 0 }}>{stats.pendingCount} Pending</h2>
        </div>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--color-primary-green)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Total Approved Revenue</p>
          <h2 style={{ color: "var(--color-primary-green)", margin: 0 }}>₦{stats.totalRevenue.toLocaleString()}</h2>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "280px", maxWidth: "700px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-400)" }} />
            <input
              type="text"
              placeholder="Search reference, student name, or reg no..."
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

                  <td data-label="Amount" style={{ padding: "1rem", fontWeight: "bold", color: "var(--color-primary-green)" }}>
                    ₦{p.AmountPaid?.toLocaleString()}
                  </td>

                  <td data-label="Receipt / Reference" style={{ padding: "1rem", textAlign: "center" }}>
                    <div style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--color-gray-600)", marginBottom: "0.25rem" }}>
                      {p.Reference || "Direct Record"}
                    </div>
                    {p.ReceiptUrl ? (
                      <button
                        onClick={() => setPreviewReceiptUrl(p.ReceiptUrl)}
                        className="btn"
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#e0f2fe", color: "#0369a1", border: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <FiImage /> View Receipt
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>Online Gateway</span>
                    )}
                  </td>

                  <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                    <span style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      background: p.Status === "Approved" || p.Status === "Successful" ? "#dcfce7" : p.Status === "Pending" ? "#fef3c7" : "#fee2e2",
                      color: p.Status === "Approved" || p.Status === "Successful" ? "#15803d" : p.Status === "Pending" ? "#b45309" : "#b91c1c"
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
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "#dcfce7", color: "#15803d", border: "none", display: "flex", alignItems: "center", gap: "0.25rem" }}
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
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "#fee2e2", color: "#b91c1c", border: "none", display: "flex", alignItems: "center", gap: "0.25rem" }}
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

      {/* Receipt Image Preview Modal */}
      {previewReceiptUrl && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "1.5rem", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Bank Transfer Receipt Preview</h3>
              <button onClick={() => setPreviewReceiptUrl(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <FiX size={20} />
              </button>
            </div>
            <img src={previewReceiptUrl} alt="Payment Receipt" style={{ width: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
