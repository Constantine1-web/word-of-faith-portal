"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FiEye, FiEyeOff } from "react-icons/fi";
import styles from "./page.module.css";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      // Map raw NextAuth error codes to friendly messages
      const errorMessages: Record<string, string> = {
        CredentialsSignin: "Invalid email or password. Please try again.",
        SessionRequired: "You must be logged in to access this page.",
        Default: "An error occurred. Please try again.",
      };
      setError(errorMessages[result.error] ?? "Invalid email or password. Please try again.");
      setLoading(false);
    } else {
      setSuccess("Login successful!");
      router.push("/portal/dashboard");
      router.refresh();
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard} style={{ textAlign: "center", maxWidth: "420px" }}>
        <img src="/logo.jpg" alt="Word of Faith Schools" style={{ width: "80px", height: "80px", borderRadius: "50%", marginBottom: "1rem", border: "3px solid var(--border-primary)", objectFit: "cover" }} />
        <h1 className={styles.title} style={{ marginBottom: "0.4rem", fontSize: "1.8rem" }}>Student Portal</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "2rem", fontWeight: 500 }}>Sign in to continue</p>
        
        {error && <div className={styles.error}>{error}</div>}
        {success && <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "0.75rem", borderRadius: "8px", marginBottom: "1.5rem", textAlign: "center", fontWeight: 600 }}>{success}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.25rem", textAlign: "left" }}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input 
              type="email" 
              id="email" 
              className={styles.input}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <div className={styles.passwordWrapper}>
              <input 
                type={showPassword ? "text" : "password"} 
                id="password" 
                className={styles.input}
                style={{ paddingRight: "3rem" }}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
              <button 
                type="button" 
                className={styles.passwordToggle} 
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className={styles.footerLinks}>
          <Link href="/portal/forgot-password" className={styles.link}>Forgot Password?</Link>
          <span style={{ color: "var(--text-secondary)" }}>New student? <Link href="/portal/register" className={styles.link}>Register Here</Link></span>
        </div>
      </div>
    </div>
  );
}
