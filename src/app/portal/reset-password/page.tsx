"use client";

import { useState, useEffect, Suspense } from "react";
import { resetPassword, requestPasswordReset } from "@/app/actions/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { FiEye, FiEyeOff, FiRefreshCw, FiInfo } from "react-icons/fi";
import styles from "../login/page.module.css";
import Link from "next/link";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Resend code states & 30-second cooldown timer
  const [resendCooldown, setResendCooldown] = useState(30);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
  }, [emailParam]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResendCode = async () => {
    if (!email || resendCooldown > 0 || resending) return;
    setResending(true);
    setResendMsg("");
    setError("");

    try {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setResendMsg("A fresh 6-digit code has been sent to your email!");
        setResendCooldown(45);
      } else {
        setError(res.error || "Failed to resend code. Please try again.");
      }
    } catch {
      setError("Network error while requesting new code.");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const result = await resetPassword(email, otp, password);
    if (result.success) {
      setSuccess(result.message || "Success");
      setTimeout(() => {
        router.push("/portal/login");
      }, 2000);
    } else {
      setError(result.error || "Failed to reset password.");
    }
    setLoading(false);
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Set New Password</h1>
        <p style={{ textAlign: "center", marginBottom: "1.25rem", color: "var(--color-gray-800)", fontSize: "0.9rem" }}>
          Enter the 6-digit code sent to <strong>{email || "your email"}</strong> and choose a new password.
        </p>

        {error && <div className={styles.error}>{error}</div>}
        {success && (
          <div style={{ background: "var(--color-primary-green)", color: "#fff", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", textAlign: "center" }}>
            {success}
          </div>
        )}
        {resendMsg && (
          <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "0.6rem 0.8rem", borderRadius: "var(--radius-sm)", marginBottom: "1.25rem", fontSize: "0.85rem", textAlign: "center" }}>
            {resendMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!emailParam && (
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>Email Address</label>
              <input type="email" id="email" className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="otp" className={styles.label}>6-Digit Reset Code</label>
            <input 
              type="text" 
              id="otp" 
              className={styles.input} 
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              style={{ textAlign: "center", fontSize: "1.5rem", letterSpacing: "6px", fontFamily: "monospace" }}
              required 
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Code expires in 15 minutes</span>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || resending}
                style={{
                  background: "none",
                  border: "none",
                  color: resendCooldown > 0 ? "#94a3b8" : "var(--color-primary-green, #10b981)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: resendCooldown > 0 ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.2rem 0.4rem",
                }}
              >
                <FiRefreshCw size={12} className={resending ? "animate-spin" : ""} />
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend Code"}
              </button>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>New Password</label>
            <div className={styles.passwordWrapper}>
              <input type={showPassword ? "text" : "password"} id="password" className={styles.input} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
            <small style={{ color: "var(--color-gray-500)", fontSize: "0.8rem", marginTop: "0.25rem", display: "block" }}>Must contain letters, numbers, and special characters (min 8 chars).</small>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.label}>Confirm New Password</label>
            <div className={styles.passwordWrapper}>
              <input type={showConfirmPassword ? "text" : "password"} id="confirmPassword" className={styles.input} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              <button type="button" className={styles.passwordToggle} onClick={() => setShowConfirmPassword(!showConfirmPassword)} title={showConfirmPassword ? "Hide password" : "Show password"}>
                {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Resetting Password..." : "Reset Password"}
          </button>

          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "0.8rem", color: "#475569", lineHeight: 1.5 }}>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: "600", color: "#1e293b", marginBottom: "0.2rem" }}>
              <FiInfo /> Need immediate assistance?
            </div>
            If the email takes too long or you no longer have access to this email address, contact your <strong>Form Master</strong> or the <strong>School ICT Administrator</strong> to reset your password instantly.
          </div>
          
          <div className={styles.footerLinks} style={{ marginTop: "1rem" }}>
            <Link href="/portal/login" className={styles.link}>← Back to Login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", marginTop: "2rem" }}>Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
