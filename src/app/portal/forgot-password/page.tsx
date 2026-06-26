"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { useRouter } from "next/navigation";
import styles from "../login/page.module.css";
import Link from "next/link";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const result = await requestPasswordReset(email);
    if (result.success) {
      setSuccess(result.message || "Success");
      setTimeout(() => {
        router.push(`/portal/reset-password?email=${encodeURIComponent(email)}`);
      }, 2000);
    } else {
      setError(result.error || "Failed");
    }
    setLoading(false);
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Reset Password</h1>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--color-gray-800)", fontSize: "0.9rem" }}>
          Enter your registered email address and we will send you a 6-digit reset code.
        </p>
        
        {error && <div className={styles.error}>{error}</div>}
        {success && <div style={{ background: "var(--color-primary-green)", color: "#fff", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", textAlign: "center" }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input 
              type="email" 
              id="email" 
              className={styles.input} 
              placeholder="Your personal email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Sending..." : "Send Reset Code"}
          </button>
          <div className={styles.footerLinks}>
            <Link href="/portal/login" className={styles.link}>← Back to Login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
