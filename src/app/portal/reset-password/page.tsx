"use client";

import { useState, useEffect, Suspense } from "react";
import { resetPassword } from "@/app/actions/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { FiEye, FiEyeOff } from "react-icons/fi";
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

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
  }, [emailParam]);

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
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--color-gray-800)", fontSize: "0.9rem" }}>
          Enter the 6-digit code sent to your email and your new password.
        </p>
        
        {error && <div className={styles.error}>{error}</div>}
        {success && <div style={{ background: "var(--color-primary-green)", color: "#fff", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", textAlign: "center" }}>{success}</div>}

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
              style={{ textAlign: "center", fontSize: "1.5rem", letterSpacing: "5px" }}
              required 
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>New Password</label>
            <div className={styles.passwordWrapper}>
              <input type={showPassword ? "text" : "password"} id="password" className={styles.input} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
            <small style={{ color: "var(--color-gray-500)", fontSize: "0.8rem", marginTop: "0.25rem", display: "block" }}>Must contain letters, numbers, and special characters.</small>
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
            {loading ? "Resetting..." : "Reset Password"}
          </button>
          
          <div className={styles.footerLinks}>
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
