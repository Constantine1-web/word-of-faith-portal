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
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess("Login successful!");
      router.push("/portal/dashboard");
      router.refresh();
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#002b1f", /* Very deep emerald green */
      padding: "1rem"
    }}>
      <div style={{
        background: "rgba(46, 220, 133, 0.1)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        padding: "3rem",
        borderRadius: "20px",
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.4)",
        width: "100%",
        maxWidth: "400px",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        textAlign: "center"
      }}>
        <img src="/logo.jpg" alt="Word of Faith Schools" style={{ width: "80px", height: "80px", borderRadius: "50%", marginBottom: "1rem", border: "3px solid rgba(255,255,255,0.8)" }} />
        <h1 style={{ marginBottom: "0.5rem", color: "#ffffff", fontSize: "1.8rem" }}>Student Portal</h1>
        <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "2rem", fontWeight: "500" }}>Sign in to continue</p>
        
        {error && <div style={{ color: "#b91c1c", background: "rgba(254, 226, 226, 0.9)", padding: "0.75rem", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.9rem", fontWeight: "bold" }}>{error}</div>}
        {success && <div style={{ background: "rgba(34, 197, 94, 0.9)", color: "#fff", padding: "0.75rem", borderRadius: "8px", marginBottom: "1.5rem", textAlign: "center" }}>{success}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem", textAlign: "left" }}>
          <div className={styles.formGroup}>
            <label htmlFor="email" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "bold", color: "#ffffff" }}>Email Address</label>
            <input 
              type="email" 
              id="email" 
              style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.95)", color: "#111827" }}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="password" style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "bold", color: "#ffffff" }}>Password</label>
            <div className={styles.passwordWrapper} style={{ position: "relative" }}>
              <input 
                type={showPassword ? "text" : "password"} 
                id="password" 
                style={{ width: "100%", padding: "0.75rem", paddingRight: "3rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.95)", color: "#111827" }}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
              <button 
                type="button" 
                className={styles.passwordToggle} 
                style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#4B5563" }}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
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
          <span style={{ color: "rgba(255,255,255,0.8)" }}>New student? <Link href="/portal/register" className={styles.link}>Register Here</Link></span>
        </div>
      </div>
    </div>
  );
}
