"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { processPayment } from "@/app/actions/payments";
import { useRouter } from "next/navigation";
import { FiLock, FiCheckCircle } from "react-icons/fi";

export default function PayFeesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [amount, setAmount] = useState("50000");
  const [description, setDescription] = useState("First Term Tuition");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const studentId = session?.user ? parseInt((session.user as any).id) : 1;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Default Term ID 1 for mock
    const res = await processPayment(studentId, parseFloat(amount), description, 1);
    
    setLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push("/portal/fees/status");
      }, 2000);
    } else {
      alert(res.error);
    }
  };

  if (success) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: "5rem", color: "var(--color-primary-green)", marginBottom: "1rem" }}>
          <FiCheckCircle />
        </div>
        <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Payment Successful!</h1>
        <p style={{ color: "var(--color-gray-600)", fontSize: "1.1rem" }}>Your payment has been approved and recorded.</p>
        <p style={{ color: "var(--color-gray-500)", marginTop: "1rem" }}>Redirecting to transaction status...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Pay School Fees</h1>

      <div style={{ 
        background: "var(--color-white)", 
        padding: "3rem 2rem", 
        borderRadius: "var(--radius-lg)", 
        boxShadow: "var(--shadow-floating)", 
        maxWidth: "600px",
        margin: "0 auto",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Mock Gateway Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ color: "var(--color-navy-blue)", display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <FiLock style={{ color: "var(--color-primary-green)" }}/> Secure Checkout
          </h2>
          <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
            Test Mode
          </span>
        </div>

        <form onSubmit={handlePayment} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Payment Description</label>
            <select 
              value={description} 
              onChange={(e) => {
                setDescription(e.target.value);
                if (e.target.value.includes("Tuition")) setAmount("50000");
                else if (e.target.value.includes("Uniform")) setAmount("15000");
                else setAmount("5000");
              }}
              style={{ width: "100%", padding: "0.8rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-300)", background: "var(--color-gray-50)", fontSize: "1rem", color: "var(--color-gray-900)" }}
            >
              <option value="First Term Tuition">First Term Tuition</option>
              <option value="School Uniforms">School Uniforms</option>
              <option value="PTA Levy">PTA Levy</option>
              <option value="Excursion Fee">Excursion Fee</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Amount (₦)</label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-500)", fontWeight: "bold", fontSize: "1.2rem" }}>₦</span>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: "100%", padding: "0.8rem 1rem 0.8rem 2.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-primary-green)", fontSize: "1.2rem", fontWeight: "bold", color: "var(--color-navy-blue)", background: "rgba(34, 197, 94, 0.05)" }}
                required
                min="1000"
              />
            </div>
          </div>

          {/* Mock Card Input */}
          <div style={{ background: "var(--color-gray-50)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", marginTop: "1rem" }}>
            <p style={{ fontSize: "0.9rem", color: "var(--color-gray-600)", marginBottom: "1rem" }}>Enter your card details (Mock Environment - enter anything)</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <input style={{ gridColumn: "1 / -1", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }} placeholder="Card Number (0000 0000 0000 0000)" required />
              <input style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }} placeholder="MM/YY" required />
              <input style={{ padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }} placeholder="CVV" required />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ padding: "1rem", fontSize: "1.1rem", marginTop: "1rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
            disabled={loading}
          >
            {loading ? "Processing..." : `Pay ₦${parseFloat(amount || "0").toLocaleString()}`}
          </button>
        </form>
      </div>
    </div>
  );
}
