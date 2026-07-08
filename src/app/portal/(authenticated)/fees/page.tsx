"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { initializePayment } from "@/app/actions/payments";
import { useRouter, useSearchParams } from "next/navigation";
import { FiLock, FiCheckCircle } from "react-icons/fi";

export default function PayFeesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [amount, setAmount] = useState("50000");
  const [description, setDescription] = useState("First Term Tuition");
  const [loading, setLoading] = useState(false);
  
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");

  const studentId = session?.user ? parseInt((session.user as any).id) : 1;

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Initialize Paystack Checkout
    const res = await initializePayment({ amount: parseFloat(amount), description, termId: 1 });
    
    if (res.error) {
      alert(res.error);
      setLoading(false);
    } else if (res.authorizationUrl) {
      // Redirect to Paystack Gateway
      window.location.href = res.authorizationUrl;
    }
  };

  if (paymentStatus === "verify") {
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
        {/* Paystack Gateway Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ color: "var(--color-navy-blue)", display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <FiLock style={{ color: "var(--color-primary-green)" }}/> Secure Checkout
          </h2>
          <span style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "0.25rem 0.75rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
            Paystack
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

          <div style={{ background: "var(--color-gray-50)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", marginTop: "1rem" }}>
            <p style={{ fontSize: "0.95rem", color: "var(--color-gray-700)", marginBottom: "0.5rem" }}>You will be securely redirected to Paystack to complete your payment.</p>
            <p style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>We do not store your credit card details.</p>
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
