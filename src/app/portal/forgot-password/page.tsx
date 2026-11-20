"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { useRouter } from "next/navigation";
import styles from "../login/page.module.css";
import Link from "next/link";

export default function ForgotPassword() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const result = await requestPasswordReset(identifier);
    if (result.success) {
      setSuccess(result.message || "Success");
      const targetEmail = result.email || identifier;
      setTimeout(() => {
        router.push(`/portal/reset-password?email=${encodeURIComponent(targetEmail)}`);
      }, 2000);
    } else {
      setError(result.error || "Failed to process request.");
    }
    setLoading(false);
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Reset Password</h1>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Enter your registered <strong>Email Address</strong> or <strong>WOFS Student ID</strong> (e.g. WOFS-STU-2026-000001) and we will send a 6-digit reset code to your email.
        </p>
        
        {error && <div className={styles.error}>{error}</div>}
        {success && <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", textAlign: "center", fontWeight: 600 }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="identifier" className={styles.label}>Email Address or WOFS Student ID</label>
            <input 
              type="text" 
              id="identifier" 
              className={styles.input} 
              placeholder="e.g. name@gmail.com or WOFS-STU-2026-000001"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Verifying & Sending Code..." : "Send Reset Code"}
          </button>
          <div className={styles.footerLinks}>
            <Link href="/portal/login" className={styles.link}>← Back to Login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
