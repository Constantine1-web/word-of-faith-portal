"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { useSession } from "next-auth/react";

export default function FeesHistoryPage() {
  const { data: session } = useSession();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (session?.user) {
        const res = await getStudentProfile(parseInt((session.user as any).id));
        if (res.success) setPayments(res.payments || []);
        setLoading(false);
      }
    }
    load();
  }, [session]);

  if (loading) return <div style={{ padding: "2rem" }}>Loading fee history...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Payment History</h1>

      <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
        <p style={{ marginBottom: "1.5rem", color: "var(--color-gray-800)" }}>Track all your academic fees and transaction statuses across all terms.</p>
        
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-100)", borderBottom: "2px solid var(--color-gray-200)", textAlign: "left" }}>
              <th style={{ padding: "1rem" }}>Description</th>
              <th style={{ padding: "1rem" }}>Term / Session</th>
              <th style={{ padding: "1rem" }}>Date</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Amount (₦)</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.length > 0 ? payments.map(p => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                <td style={{ padding: "1rem", fontWeight: 500, color: "var(--color-gray-900)" }}>{p.description}</td>
                <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>{p.term} ({p.session})</td>
                <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>{new Date(p.date).toLocaleDateString()}</td>
                <td style={{ padding: "1rem", textAlign: "right", fontWeight: "bold", color: "var(--color-navy-blue)" }}>{p.amount.toLocaleString()}</td>
                <td style={{ padding: "1rem", textAlign: "center" }}>
                  <span style={{ 
                    padding: "0.25rem 0.75rem", 
                    borderRadius: "var(--radius-full)", 
                    fontSize: "0.85rem", 
                    fontWeight: 600,
                    backgroundColor: p.status === 'Approved' ? 'rgba(74, 222, 128, 0.2)' : p.status === 'Rejected' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(251, 146, 60, 0.2)',
                    color: p.status === 'Approved' ? '#166534' : p.status === 'Rejected' ? '#991b1b' : '#9a3412'
                  }}>
                    {p.status}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)", fontStyle: "italic" }}>
                  No payment history found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
