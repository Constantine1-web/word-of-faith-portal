"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { useSession } from "next-auth/react";
import { FiDownload, FiPrinter, FiX, FiCheckCircle, FiShield } from "react-icons/fi";

export default function FeesHistoryPage() {
  const { data: session } = useSession();
  const [student, setStudent] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (session?.user) {
        const res = await getStudentProfile(parseInt((session.user as any).id));
        if (res.success) {
          setStudent(res.student || null);
          setPayments(res.payments || []);
        }
        setLoading(false);
      }
    }
    load();
  }, [session]);

  const handlePrintReceipt = (receipt: any) => {
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) {
      window.print();
      return;
    }

    const receiptNo = `WOF/BUR/${new Date(receipt.date).getFullYear()}/${String(receipt.id).padStart(5, "0")}`;
    const studentName = student?.fullName || student?.preferredName || student?.admissionNo || "Student";
    const admissionNo = student?.admissionNo || "—";
    const className = student?.className || "—";
    const isApproved = receipt.status === "Approved" || receipt.status === "Successful";

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Fee Receipt - ${receiptNo}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; padding: 32px; background: #fff; }
            .receipt-box { max-width: 720px; margin: 0 auto; border: 2px solid #0A2540; border-radius: 12px; padding: 32px; position: relative; }
            .header { text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 18px; margin-bottom: 24px; }
            .school-name { font-size: 24px; font-weight: 800; color: #0A2540; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; }
            .school-sub { font-size: 13px; color: #15803d; font-weight: 700; margin: 4px 0 0 0; }
            .doc-title { display: inline-block; margin-top: 12px; background: #0A2540; color: #fff; padding: 5px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: #f8fafc; padding: 16px 20px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 24px; font-size: 13.5px; }
            .meta-item strong { color: #0A2540; display: block; font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { background: #f1f5f9; color: #0A2540; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
            td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .amount-row td { font-size: 18px; font-weight: 800; color: #0A2540; background: #f0fdf4; border-top: 2px solid #16a34a; }
            .stamp { display: inline-block; padding: 8px 18px; border: 2px solid ${isApproved ? "#16a34a" : "#d97706"}; color: ${isApproved ? "#15803d" : "#b45309"}; font-weight: 800; font-size: 13px; border-radius: 8px; text-transform: uppercase; letter-spacing: 1px; }
            .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px; padding-top: 18px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; }
            @media print { .no-print { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="receipt-box">
            <div class="header">
              <h1 class="school-name">Word of Faith Group of Schools</h1>
              <p class="school-sub">Bursary &amp; Financial Services Division • Official Payment Receipt</p>
              <span class="doc-title">Receipt No: ${receiptNo}</span>
            </div>
            <div class="meta-grid">
              <div class="meta-item"><strong>Student Name</strong>${studentName}</div>
              <div class="meta-item"><strong>Admission Number</strong>${admissionNo}</div>
              <div class="meta-item"><strong>Class / Level</strong>${className} (${student?.level || "Secondary"})</div>
              <div class="meta-item"><strong>Academic Term &amp; Session</strong>${receipt.term} (${receipt.session})</div>
              <div class="meta-item"><strong>Transaction Reference</strong>${receipt.reference || `TXN-${receipt.id}`}</div>
              <div class="meta-item"><strong>Payment Date &amp; Channel</strong>${new Date(receipt.date).toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })} (${receipt.channel || "OFFICIAL"})</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Fee Description</th>
                  <th>Session / Term</th>
                  <th style="text-align: right;">Amount Paid (NGN)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>${receipt.description}</strong></td>
                  <td>${receipt.term} • ${receipt.session}</td>
                  <td style="text-align: right; font-weight: 700;">₦${Number(receipt.amount).toLocaleString()}</td>
                </tr>
                <tr class="amount-row">
                  <td colspan="2">Total Amount Credited</td>
                  <td style="text-align: right;">₦${Number(receipt.amount).toLocaleString()}.00</td>
                </tr>
              </tbody>
            </table>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div class="stamp">${isApproved ? "✓ VERIFIED & CLEARED BY BURSARY" : `STATUS: ${receipt.status.toUpperCase()}`}</div>
              <div style="text-align: right; font-size: 12px; color: #475569;">
                <strong>Generated At:</strong> ${new Date().toLocaleString("en-NG")}
              </div>
            </div>
            <div class="footer">
              <div>This is a computer-generated official receipt from the Word of Faith Schools Portal.</div>
              <div style="text-align: right;"><strong>Authorized Signatory:</strong> School Bursar</div>
            </div>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading fee history...</div>;

  return (
    <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        Payment History &amp; Official Receipts
      </h1>

      <div style={{ background: "var(--color-white)", padding: "clamp(1rem, 2.5vw, 2rem)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
        <p style={{ marginBottom: "1.5rem", color: "var(--color-gray-800)" }}>
          Track all your academic fees, transaction references, and download official school bursary receipts across all terms.
        </p>

        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-100)", borderBottom: "2px solid var(--color-gray-200)", textAlign: "left" }}>
                <th style={{ padding: "1rem" }}>Receipt / Ref</th>
                <th style={{ padding: "1rem" }}>Description</th>
                <th style={{ padding: "1rem" }}>Term / Session</th>
                <th style={{ padding: "1rem" }}>Date</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Amount (₦)</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Official Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.length > 0 ? (
                payments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                    <td style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.84rem", color: "#334155", fontWeight: 600 }}>
                      {p.reference || `WOF-REC-${String(p.id).padStart(6, "0")}`}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: 600, color: "var(--color-gray-900)" }}>{p.description}</td>
                    <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>
                      {p.term} ({p.session})
                    </td>
                    <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>
                      {new Date(p.date).toLocaleDateString("en-NG", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right", fontWeight: "bold", color: "var(--color-navy-blue)" }}>
                      ₦{Number(p.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          backgroundColor:
                            p.status === "Approved" || p.status === "Successful"
                              ? "rgba(74, 222, 128, 0.2)"
                              : p.status === "Rejected"
                              ? "rgba(239, 68, 68, 0.2)"
                              : "rgba(251, 146, 60, 0.2)",
                          color:
                            p.status === "Approved" || p.status === "Successful"
                              ? "#166534"
                              : p.status === "Rejected"
                              ? "#991b1b"
                              : "#9a3412",
                        }}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.45rem" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(p)}
                          style={{
                            padding: "0.4rem 0.75rem",
                            borderRadius: "8px",
                            border: "1px solid #cbd5e1",
                            background: "#f8fafc",
                            color: "#0A2540",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintReceipt(p)}
                          style={{
                            padding: "0.4rem 0.8rem",
                            borderRadius: "8px",
                            border: "none",
                            background: "#0A2540",
                            color: "white",
                            fontSize: "0.8rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                          }}
                        >
                          <FiDownload size={13} /> PDF Receipt
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)", fontStyle: "italic" }}>
                    No payment history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Receipt Preview Modal */}
        {selectedReceipt && (
          <div
            style={{
              marginTop: "2rem",
              border: "2px solid #0A2540",
              borderRadius: "12px",
              padding: "1.75rem",
              background: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", borderBottom: "2px solid #16a34a", paddingBottom: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#15803d", textTransform: "uppercase" }}>
                  Word of Faith Group of Schools • Bursary Division
                </div>
                <h3 style={{ margin: "0.2rem 0", color: "#0A2540", fontSize: "1.25rem" }}>
                  Official School Fee Receipt — WOF/BUR/{new Date(selectedReceipt.date).getFullYear()}/{String(selectedReceipt.id).padStart(5, "0")}
                </h3>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => handlePrintReceipt(selectedReceipt)}
                  style={{
                    background: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 0.95rem",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <FiPrinter size={14} /> Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  style={{
                    background: "#e2e8f0",
                    color: "#334155",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 0.75rem",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <FiX size={14} /> Close
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.25rem", fontSize: "0.88rem" }}>
              <div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>Student</div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{student?.fullName || student?.admissionNo}</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>Admission No &amp; Class</div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{student?.admissionNo} • {student?.className}</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>Term &amp; Session</div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{selectedReceipt.term} ({selectedReceipt.session})</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>Amount Credited</div>
                <div style={{ fontWeight: 800, color: "#15803d", fontSize: "1.1rem" }}>₦{Number(selectedReceipt.amount).toLocaleString()}.00</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", paddingTop: "0.85rem", borderTop: "1px dashed #cbd5e1", fontSize: "0.82rem", color: "#475569" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontWeight: 700, color: "#15803d" }}>
                <FiCheckCircle /> Verified &amp; Cleared by Word of Faith Schools Bursary
              </span>
              <span>Reference: <strong>{selectedReceipt.reference}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
