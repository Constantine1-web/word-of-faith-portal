"use client";

import { useState } from "react";
import { initiateRegistration, verifyRegistration } from "@/app/actions/auth";
import { useRouter } from "next/navigation";
import { FiEye, FiEyeOff } from "react-icons/fi";

// Validate password strength: letters, numbers, and special characters
function validatePasswordStrength(password: string) {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasLetter && hasNumber && hasSpecial && password.length >= 8;
}
import styles from "../login/page.module.css";
import Link from "next/link";

export default function Register() {
  const router = useRouter();
  
  // Step 1 State
  const [admissionNo, setAdmissionNo] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Step 2 State
  const [step, setStep] = useState<1 | 2>(1);
  const [otp, setOtp] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (!validatePasswordStrength(password)) {
      setError("Password must be at least 8 characters and contain letters, numbers, and special characters.");
      setLoading(false);
      return;
    }

    const result = await initiateRegistration(admissionNo, email);

    if (result.success) {
      setSuccess("Verification code sent to your email!");
      setStep(2);
    } else {
      setError(result.error || "Failed to initiate registration");
    }
    setLoading(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const result = await verifyRegistration(admissionNo, preferredName, email, password, otp);

    if (result.success) {
      setSuccess(result.message || "Success");
      setTimeout(() => {
        router.push("/portal/login");
      }, 2000);
    } else {
      setError(result.error || "Failed to verify code");
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Student Registration</h1>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--color-gray-800)", fontSize: "0.9rem" }}>
          {step === 1 ? "Enter your school-assigned Registration Number to claim your portal account." : "Enter the 6-digit verification code sent to your email."}
        </p>
        
        {error && <div className={styles.error}>{error}</div>}
        {success && <div style={{ background: "var(--color-primary-green)", color: "#fff", padding: "0.75rem", borderRadius: "var(--radius-sm)", marginBottom: "1.5rem", textAlign: "center" }}>{success}</div>}

        {step === 1 ? (
          <form onSubmit={handleInitiate}>
            <div className={styles.formGroup}>
              <label htmlFor="admissionNo" className={styles.label}>Registration Number</label>
              <input type="text" id="admissionNo" className={styles.input} placeholder="e.g. WOF/2026/001" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} required />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="preferredName" className={styles.label}>Preferred Display Name</label>
              <input type="text" id="preferredName" className={styles.input} placeholder="e.g. John Doe" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} required />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.label}>Setup Email Address</label>
              <input type="email" id="email" className={styles.input} placeholder="Your personal email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>Create Password</label>
              <div className={styles.passwordWrapper}>
                <input type={showPassword ? "text" : "password"} id="password" className={styles.input} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowPassword(!showPassword)} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
              <small style={{ color: "var(--color-gray-500)", fontSize: "0.8rem", marginTop: "0.25rem", display: "block" }}>Must contain letters, numbers, and special characters.</small>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword" className={styles.label}>Confirm Password</label>
              <div className={styles.passwordWrapper}>
                <input type={showConfirmPassword ? "text" : "password"} id="confirmPassword" className={styles.input} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowConfirmPassword(!showConfirmPassword)} title={showConfirmPassword ? "Hide password" : "Show password"}>
                  {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? "Sending Code..." : "Continue"}
            </button>
            <div className={styles.footerLinks}>
              <Link href="/portal/login" className={styles.link}>Already claimed? Log in</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className={styles.formGroup}>
              <label htmlFor="otp" className={styles.label}>6-Digit Code</label>
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
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? "Verifying..." : "Verify & Create Account"}
            </button>
            <div className={styles.footerLinks}>
              <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "var(--color-primary-green)", cursor: "pointer", textDecoration: "underline" }}>← Back to details</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
