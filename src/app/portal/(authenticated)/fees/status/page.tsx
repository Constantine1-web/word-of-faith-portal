"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi";

export default function FeeStatusPage() {
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

  if (loading) return <div style={{ padding: "2rem" }}>Loading transaction statuses...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0 }}>Transaction Status</h1>
        <Link href="/portal/fees" className="btn btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}>Make New Payment</Link>
      </div>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        {payments.length > 0 ? payments.map((p, idx) => (
          <div key={idx} style={{ 
            background: "var(--color-white)", 
            padding: "1.5rem 2rem", 
            borderRadius: "var(--radius-lg)", 
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderLeft: `4px solid ${p.status === 'Approved' ? 'var(--color-primary-green)' : p.status === 'Rejected' ? 'red' : 'orange'}`
          }}>
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <div style={{ 
                fontSize: "2rem", 
                color: p.status === 'Approved' ? 'var(--color-primary-green)' : p.status === 'Rejected' ? 'red' : 'orange'
              }}>
                {p.status === 'Approved' ? <FiCheckCircle /> : p.status === 'Rejected' ? <FiXCircle /> : <FiClock />}
              </div>
              <div>
                <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", fontSize: "1.2rem" }}>{p.description}</h3>
                <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", margin: 0 }}>
                  Reference: TXN-{p.id.toString().padStart(6, '0')} • {new Date(p.date).toLocaleDateString()}
                </p>
              </div>
            </div>
            
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-gray-900)", margin: 0 }}>
                ₦{p.amount.toLocaleString()}
              </p>
              <p style={{ 
                color: p.status === 'Approved' ? 'var(--color-primary-green)' : p.status === 'Rejected' ? 'red' : 'orange',
                fontWeight: 600,
                fontSize: "0.9rem",
                margin: 0
              }}>
                {p.status.toUpperCase()}
              </p>
            </div>
          </div>
        )) : (
          <div style={{ background: "var(--color-white)", padding: "3rem", textAlign: "center", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
            <p style={{ color: "var(--color-gray-600)", fontSize: "1.1rem" }}>No transactions found for your account.</p>
            <Link href="/portal/fees" className="btn btn-outline" style={{ marginTop: "1rem" }}>Pay School Fees Now</Link>
          </div>
        )}
      </div>
    </div>
  );
}
