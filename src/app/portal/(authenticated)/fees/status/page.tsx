"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FiCheckCircle, FiClock, FiXCircle, FiDownload } from "react-icons/fi";

export default function FeeStatusPage() {
  const { data: session } = useSession();
  const [student, setStudent] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
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

  const handleDownloadReceipt = (receipt: any) => {
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
            .receipt-box { max-width: 720px; margin: 0 auto; border: 2px solid #0A2540; border-radius: 12px; padding: 32px; }
            .header { text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 18px; margin-bottom: 24px; }
            .school-name { font-size: 24px; font-weight: 800; color: #0A2540; text-transform: uppercase; margin: 0; }
            .school-sub { font-size: 13px; color: #15803d; font-weight: 700; margin: 4px 0 0 0; }
            .doc-title { display: inline-block; margin-top: 12px; background: #0A2540; color: #fff; padding: 5px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: #f8fafc; padding: 16px 20px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 24px; font-size: 13.5px; }
            .meta-item strong { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { background: #f1f5f9; color: #0A2540; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
            td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .amount-row td { font-size: 18px; font-weight: 800; color: #0A2540; background: #f0fdf4; border-top: 2px solid #16a34a; }
            .stamp { display: inline-block; padding: 8px 18px; border: 2px solid ${isApproved ? "#16a34a" : "#d97706"}; color: ${isApproved ? "#15803d" : "#b45309"}; font-weight: 800; font-size: 13px; border-radius: 8px; text-transform: uppercase; }
            .footer { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 18px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; }
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

  if (loading) return <div style={{ padding: "2rem" }}>Loading transaction statuses...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0 }}>Transaction Status</h1>
        <Link href="/portal/fees" className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
          Make New Payment
        </Link>
      </div>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        {payments.length > 0 ? (
          payments.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: "var(--color-white)",
                padding: "1.5rem 2rem",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                borderLeft: `4px solid ${
                  p.status === "Approved" || p.status === "Successful"
                    ? "var(--color-primary-green)"
                    : p.status === "Rejected"
                    ? "red"
                    : "orange"
                }`,
              }}
            >
              <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
                <div
                  style={{
                    fontSize: "2rem",
                    color:
                      p.status === "Approved" || p.status === "Successful"
                        ? "var(--color-primary-green)"
                        : p.status === "Rejected"
                        ? "red"
                        : "orange",
                  }}
                >
                  {p.status === "Approved" || p.status === "Successful" ? (
                    <FiCheckCircle />
                  ) : p.status === "Rejected" ? (
                    <FiXCircle />
                  ) : (
                    <FiClock />
                  )}
                </div>
                <div>
                  <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", fontSize: "1.2rem" }}>
                    {p.description}
                  </h3>
                  <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", margin: 0 }}>
                    Reference: {p.reference || `TXN-${p.id.toString().padStart(6, "0")}`} •{" "}
                    {new Date(p.date).toLocaleDateString("en-NG", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    • {p.term} ({p.session})
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginLeft: "auto" }}>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-gray-900)", margin: 0 }}>
                    ₦{Number(p.amount).toLocaleString()}
                  </p>
                  <p
                    style={{
                      color:
                        p.status === "Approved" || p.status === "Successful"
                          ? "var(--color-primary-green)"
                          : p.status === "Rejected"
                          ? "red"
                          : "orange",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      margin: 0,
                    }}
                  >
                    {p.status.toUpperCase()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownloadReceipt(p)}
                  style={{
                    background: "#0A2540",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.55rem 0.95rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <FiDownload size={14} /> Official PDF Receipt
                </button>
              </div>
            </div>
          ))
        ) : (
          <div style={{ background: "var(--color-white)", padding: "3rem", textAlign: "center", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
            <p style={{ color: "var(--color-gray-600)", fontSize: "1.1rem" }}>No transactions found for your account.</p>
            <Link href="/portal/fees" className="btn btn-outline" style={{ marginTop: "1rem" }}>
              Pay School Fees Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
