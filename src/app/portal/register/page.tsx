"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import {
  validateRegistrationInvitation,
  sendInvitationGuardianOtp,
  completeInvitationClaim,
  submitManualVerificationRequest,
  getPublicRegistrationClasses,
} from "@/app/actions/auth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FiEye,
  FiEyeOff,
  FiCheckCircle,
  FiShield,
  FiKey,
  FiUserCheck,
  FiCamera,
  FiAlertCircle,
  FiArrowRight,
  FiArrowLeft,
} from "react-icons/fi";
import styles from "../login/page.module.css";

function validatePasswordStrength(password: string) {
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasLetter && hasNumber && hasSpecial && password.length >= 8;
}

function RegisterFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialInviteParam = searchParams.get("invite") || "";

  // Pathway Switcher: "INVITE" (Standard Invitation Claim) vs "MANUAL" (Manual Verification Request)
  const [pathway, setPathway] = useState<"INVITE" | "MANUAL">("INVITE");

  // Invitation Pathway State (Steps 1 -> 2 -> 3 -> 4)
  const [inviteStep, setInviteStep] = useState<1 | 2 | 3 | 4>(1);
  const [inviteCode, setInviteCode] = useState(initialInviteParam);
  const [validatedStudent, setValidatedStudent] = useState<{
    wofsStudentId: string;
    fullName: string;
    firstName: string;
    lastName: string;
    className: string;
    level: string;
    hasGuardianContact: boolean;
    maskedGuardianEmail: string | null;
    maskedGuardianPhone: string | null;
  } | null>(null);

  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [verificationPhotoDataUrl, setVerificationPhotoDataUrl] = useState<string>("");
  const [claimedWofsId, setClaimedWofsId] = useState<string>("");

  // Manual Verification Request State
  const [classes, setClasses] = useState<Array<{ ClassID: number; ClassName: string }>>([]);
  const [manualForm, setManualForm] = useState({
    wofsStudentIdInput: "",
    firstName: "",
    lastName: "",
    middleName: "",
    dateOfBirth: "",
    gender: "Female",
    requestedClassId: 1,
    guardianName: "",
    guardianPhone: "",
    contactEmail: "",
    contactPhone: "",
    password: "",
    confirmPassword: "",
    reasonForManual: "Guardian email/phone is not yet recorded on school file",
  });
  const [manualReferenceCode, setManualReferenceCode] = useState<string | null>(null);

  // Camera helper for Identity Verification Photo
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPublicRegistrationClasses().then((res) => {
      if (res.success && res.classes.length > 0) {
        setClasses(res.classes);
        setManualForm((prev) => ({ ...prev, requestedClassId: res.classes[0].ClassID }));
      }
    });
  }, []);

  // Auto-validate if `?invite=...` query param was passed
  useEffect(() => {
    const cleanCode = initialInviteParam.trim();
    if (!cleanCode) return;

    let cancelled = false;
    (async () => {
      const res = await validateRegistrationInvitation(cleanCode);
      if (cancelled) return;
      if (res.success && res.invitation) {
        setValidatedStudent(res.invitation.student);
        setPreferredName(res.invitation.student.fullName);
        setInviteStep(2);
        setSuccess("Invitation verified! Confirm your school record and verify your email below.");
      } else {
        setError(res.error || "Invalid or expired invitation code.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialInviteParam]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const startVerificationCamera = async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setError("Camera unavailable. You can upload an identity verification photo file instead.");
    }
  };

  const captureVerificationSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 320, 320);
    setVerificationPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.85));
    stopCamera();
  };

  const handlePhotoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setVerificationPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // STEP 1: Validate Single-Use Invitation
  const handleValidateInvite = async (e?: React.FormEvent, overrideCode?: string) => {
    if (e) e.preventDefault();
    const codeToUse = (overrideCode ?? inviteCode).trim();
    if (!codeToUse) {
      setError("Please enter your Single-Use Registration Invitation Code.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await validateRegistrationInvitation(codeToUse);
    setLoading(false);

    if (res.success && res.invitation) {
      setValidatedStudent(res.invitation.student);
      setPreferredName(res.invitation.student.fullName);
      setInviteStep(2);
      setSuccess("Invitation verified! Confirm your school record and verify your email below.");
    } else {
      setError(res.error || "Invalid or expired invitation code.");
    }
  };

  // STEP 2: Request 6-Digit Guardian / Registration OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!validatePasswordStrength(password)) {
      setError(
        "Password must be at least 8 characters and contain letters, numbers, and special characters."
      );
      return;
    }

    setLoading(true);
    const res = await sendInvitationGuardianOtp({
      inviteCodeOrToken: inviteCode,
      email,
      phone,
    });
    setLoading(false);

    if (res.success) {
      setSuccess(res.message || "Verification code sent!");
      setInviteStep(3);
    } else {
      setError(res.error || "Failed to send verification code.");
    }
  };

  // STEP 3: Verify OTP & Complete Account Claim
  const handleCompleteClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await completeInvitationClaim({
      inviteCodeOrToken: inviteCode,
      email,
      phone,
      preferredName,
      password,
      otp,
      verificationPhotoDataUrl: verificationPhotoDataUrl || undefined,
    });
    setLoading(false);

    if (res.success) {
      setClaimedWofsId(res.wofsStudentId || validatedStudent?.wofsStudentId || "");
      setSuccess(res.message || "Student portal account activated!");
      setInviteStep(4);
    } else {
      setError(res.error || "Verification failed.");
    }
  };

  // MANUAL PATHWAY: Submit Manual Registration Verification Request
  const handleSubmitManualRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (manualForm.password !== manualForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!validatePasswordStrength(manualForm.password)) {
      setError(
        "Password must be at least 8 characters and contain letters, numbers, and special characters."
      );
      return;
    }

    setLoading(true);
    const res = await submitManualVerificationRequest({
      wofsStudentIdInput: manualForm.wofsStudentIdInput,
      firstName: manualForm.firstName,
      lastName: manualForm.lastName,
      middleName: manualForm.middleName,
      dateOfBirth: manualForm.dateOfBirth,
      gender: manualForm.gender,
      requestedClassId: manualForm.requestedClassId,
      guardianName: manualForm.guardianName,
      guardianPhone: manualForm.guardianPhone,
      contactEmail: manualForm.contactEmail,
      contactPhone: manualForm.contactPhone,
      password: manualForm.password,
      reasonForManual: manualForm.reasonForManual,
      verificationPhotoDataUrl: verificationPhotoDataUrl || undefined,
    });
    setLoading(false);

    if (res.success) {
      setManualReferenceCode(res.referenceCode || "WOFS-MVR-SUBMITTED");
      setSuccess(res.message || "Manual verification request submitted!");
    } else {
      setError(res.error || "Failed to submit verification request.");
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard} style={{ maxWidth: "540px", width: "100%" }}>
        <h1 className={styles.title} style={{ marginBottom: "0.35rem" }}>
          Student Account Claim &amp; Verification
        </h1>
        <p
          style={{
            textAlign: "center",
            marginBottom: "1.25rem",
            color: "var(--text-secondary)",
            fontSize: "0.88rem",
          }}
        >
          Word of Faith Schools automatically assigns every pupil and student a permanent{" "}
          <strong>WOFS Student ID</strong>. Claim your pre-established record below.
        </p>

        {/* Pathway Selector Tabs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem",
            background: "var(--bg-secondary)",
            padding: "0.35rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-primary)",
            marginBottom: "1.5rem",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setPathway("INVITE");
              setError("");
              setSuccess("");
            }}
            style={{
              padding: "0.55rem 0.65rem",
              borderRadius: "6px",
              border: "none",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              background: pathway === "INVITE" ? "var(--brand-primary)" : "transparent",
              color: pathway === "INVITE" ? "var(--brand-primary-text)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
            }}
          >
            <FiKey /> Claim with Invitation
          </button>

          <button
            type="button"
            onClick={() => {
              setPathway("MANUAL");
              setError("");
              setSuccess("");
            }}
            style={{
              padding: "0.55rem 0.65rem",
              borderRadius: "6px",
              border: "none",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              background: pathway === "MANUAL" ? "var(--brand-primary)" : "transparent",
              color: pathway === "MANUAL" ? "var(--brand-primary-text)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.35rem",
            }}
          >
            <FiUserCheck /> Manual Verification
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && (
          <div
            style={{
              background: "var(--status-success-bg)",
              color: "var(--status-success-text)",
              border: "1px solid var(--status-success-border)",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-sm)",
              marginBottom: "1.25rem",
              textAlign: "center",
              fontWeight: 600,
              fontSize: "0.88rem",
            }}
          >
            {success}
          </div>
        )}

        {/* ================================================================
            PATHWAY 1: INVITATION-BASED STUDENT ACCOUNT CLAIMING
           ================================================================ */}
        {pathway === "INVITE" && (
          <>
            {inviteStep === 1 && (
              <form onSubmit={(e) => handleValidateInvite(e)}>
                <div className={styles.formGroup}>
                  <label htmlFor="inviteCode" className={styles.label}>
                    Single-Use Registration Invitation Code *
                  </label>
                  <input
                    type="text"
                    id="inviteCode"
                    className={styles.input}
                    placeholder="e.g. WOFS-INV-8K4P9M2X"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    style={{
                      textTransform: "uppercase",
                      fontFamily: "monospace",
                      fontSize: "1.05rem",
                      letterSpacing: "1px",
                    }}
                    required
                  />
                  <small
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.78rem",
                      marginTop: "0.35rem",
                      display: "block",
                    }}
                  >
                    Provided on your school registration slip, email, or WhatsApp invitation. No old admission number is required.
                  </small>
                </div>

                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Validating Invitation..." : "Validate Invitation & Retrieve Record"}
                </button>

                <div
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.85rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.82rem",
                    color: "var(--text-secondary)",
                    textAlign: "center",
                  }}
                >
                  Don&apos;t have an invitation slip or guardian contact on file?{" "}
                  <button
                    type="button"
                    onClick={() => setPathway("MANUAL")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--brand-primary)",
                      fontWeight: 700,
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Request Manual School Verification &rarr;
                  </button>
                </div>
              </form>
            )}

            {inviteStep === 2 && validatedStudent && (
              <form onSubmit={handleSendOtp}>
                {/* Locked Student Identity Card */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-primary)",
                    borderLeft: "4px solid var(--brand-primary)",
                    borderRadius: "var(--radius-sm)",
                    padding: "1rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        color: "var(--status-success-text)",
                        background: "var(--status-success-bg)",
                        padding: "0.18rem 0.55rem",
                        borderRadius: "999px",
                      }}
                    >
                      Verified School Record (Read-Only)
                    </span>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 800,
                        fontSize: "0.9rem",
                        color: "var(--text-heading)",
                      }}
                    >
                      {validatedStudent.wofsStudentId}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-heading)" }}>
                    {validatedStudent.fullName}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                    Assigned Class: <strong>{validatedStudent.className}</strong> ({validatedStudent.level})
                  </div>
                  {(validatedStudent.maskedGuardianEmail || validatedStudent.maskedGuardianPhone) && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                      Guardian on file:{" "}
                      {[validatedStudent.maskedGuardianEmail, validatedStudent.maskedGuardianPhone]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="preferredName" className={styles.label}>
                    Preferred Portal Display Name *
                  </label>
                  <input
                    type="text"
                    id="preferredName"
                    className={styles.input}
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="email" className={styles.label}>
                    Portal Login &amp; Verification Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    className={styles.input}
                    placeholder="Parent or student email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="phone" className={styles.label}>
                    Parent / Guardian Phone (WhatsApp &amp; SMS) *
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    className={styles.input}
                    placeholder="e.g. 08031234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="password" className={styles.label}>
                    Create Portal Password *
                  </label>
                  <div className={styles.passwordWrapper}>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      className={styles.input}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                    </button>
                  </div>
                  <small style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}>
                    Min 8 characters with letters, numbers, and a special character.
                  </small>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="confirmPassword" className={styles.label}>
                    Confirm Password *
                  </label>
                  <div className={styles.passwordWrapper}>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      id="confirmPassword"
                      className={styles.input}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Sending 6-Digit OTP..." : "Send Verification Code"}
                </button>

                <div className={styles.footerLinks}>
                  <button
                    type="button"
                    onClick={() => setInviteStep(1)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--brand-primary)",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    <FiArrowLeft style={{ verticalAlign: "middle" }} /> Change Invitation Code
                  </button>
                </div>
              </form>
            )}

            {inviteStep === 3 && validatedStudent && (
              <form onSubmit={handleCompleteClaim}>
                <div className={styles.formGroup}>
                  <label htmlFor="otp" className={styles.label}>
                    Enter 6-Digit Verification Code *
                  </label>
                  <input
                    type="text"
                    id="otp"
                    className={styles.input}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                    style={{
                      textAlign: "center",
                      fontSize: "1.5rem",
                      letterSpacing: "6px",
                      fontFamily: "monospace",
                    }}
                    required
                  />
                </div>

                {/* Optional Identity Verification Snapshot (Stored separately from Profile Picture) */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.9rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "var(--text-heading)",
                      marginBottom: "0.35rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    <FiShield color="var(--brand-primary)" /> Identity Verification Snapshot (Optional)
                  </div>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0 0 0.65rem 0" }}>
                    Stored securely in your restricted verification record (separate from your customizable profile avatar).
                  </p>

                  {verificationPhotoDataUrl ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <img
                        src={verificationPhotoDataUrl}
                        alt="Verification capture"
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          border: "2px solid var(--brand-primary)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setVerificationPhotoDataUrl("")}
                        className="btn btn-outline"
                        style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                      >
                        Retake / Remove
                      </button>
                    </div>
                  ) : cameraOpen ? (
                    <div style={{ textAlign: "center" }}>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: "100%",
                          maxWidth: "240px",
                          borderRadius: "8px",
                          background: "#000",
                        }}
                      />
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={captureVerificationSnapshot}
                          className="btn btn-primary"
                          style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
                        >
                          Capture Snapshot
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="btn btn-outline"
                          style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={startVerificationCamera}
                        className="btn btn-outline"
                        style={{
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.8rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <FiCamera /> Capture with Camera
                      </button>
                      <label
                        className="btn btn-outline"
                        style={{
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          margin: 0,
                        }}
                      >
                        Upload Photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePhotoFileUpload}
                          style={{ display: "none" }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Verifying & Activating Account..." : "Complete Claim & Activate Account"}
                </button>

                <div className={styles.footerLinks}>
                  <button
                    type="button"
                    onClick={() => setInviteStep(2)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--brand-primary)",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    <FiArrowLeft style={{ verticalAlign: "middle" }} /> Back to details
                  </button>
                </div>
              </form>
            )}

            {inviteStep === 4 && (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <FiCheckCircle
                  size={48}
                  color="var(--status-success-text)"
                  style={{ marginBottom: "0.75rem" }}
                />
                <h2 style={{ color: "var(--text-heading)", margin: "0 0 0.5rem 0", fontSize: "1.35rem" }}>
                  Portal Account Claimed!
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
                  Your permanent Word of Faith Schools Student ID is:
                </p>
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    border: "2px solid var(--brand-primary)",
                    borderRadius: "var(--radius-md)",
                    padding: "1.1rem",
                    fontFamily: "monospace",
                    fontSize: "1.35rem",
                    fontWeight: 900,
                    color: "var(--text-heading)",
                    letterSpacing: "1px",
                    marginBottom: "1.5rem",
                  }}
                >
                  {claimedWofsId}
                </div>
                <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                  Save this ID. You can sign in to the portal using either your email (<strong>{email}</strong>) or your permanent WOFS Student ID above.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/portal/login")}
                  className={styles.button}
                >
                  Proceed to Portal Login <FiArrowRight style={{ verticalAlign: "middle" }} />
                </button>
              </div>
            )}
          </>
        )}

        {/* ================================================================
            PATHWAY 2: MANUAL REGISTRATION VERIFICATION REQUEST
           ================================================================ */}
        {pathway === "MANUAL" && (
          <>
            {manualReferenceCode ? (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <FiCheckCircle
                  size={46}
                  color="var(--status-success-text)"
                  style={{ marginBottom: "0.75rem" }}
                />
                <h2 style={{ color: "var(--text-heading)", margin: "0 0 0.5rem 0", fontSize: "1.3rem" }}>
                  Verification Request Submitted
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1rem" }}>
                  Your request is now in the school&apos;s administrative verification queue.
                </p>
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.9rem",
                    fontFamily: "monospace",
                    fontWeight: 800,
                    fontSize: "1.1rem",
                    color: "var(--text-heading)",
                    marginBottom: "1.25rem",
                  }}
                >
                  Ref: {manualReferenceCode}
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                  Once an administrator verifies your details against school records, your permanent{" "}
                  <strong>WOFS-STU</strong> ID and portal account will be activated and sent to{" "}
                  <strong>{manualForm.contactEmail}</strong>.
                </p>
                <Link href="/portal/login" className={styles.button} style={{ display: "inline-block", textDecoration: "none" }}>
                  Return to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmitManualRequest}>
                <div
                  style={{
                    background: "var(--status-info-bg)",
                    color: "var(--status-info-text)",
                    border: "1px solid var(--status-info-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem 0.9rem",
                    fontSize: "0.8rem",
                    marginBottom: "1.25rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                  }}
                >
                  <FiAlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span>
                    Use this pathway if the school does not yet have your parent/guardian&apos;s active email or phone on file. A school administrator will review and approve your registration.
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div className={styles.formGroup}>
                    <label className={styles.label}>First Name *</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={manualForm.firstName}
                      onChange={(e) => setManualForm({ ...manualForm, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Surname / Last Name *</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={manualForm.lastName}
                      onChange={(e) => setManualForm({ ...manualForm, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Date of Birth *</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={manualForm.dateOfBirth}
                      onChange={(e) => setManualForm({ ...manualForm, dateOfBirth: e.target.value })}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Current Class &amp; Arm *</label>
                    <select
                      className={styles.input}
                      value={manualForm.requestedClassId}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, requestedClassId: parseInt(e.target.value, 10) })
                      }
                      required
                    >
                      {classes.map((c) => (
                        <option key={c.ClassID} value={c.ClassID}>
                          {c.ClassName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Parent / Guardian Name</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="e.g. Mr. & Mrs. Okon"
                      value={manualForm.guardianName}
                      onChange={(e) => setManualForm({ ...manualForm, guardianName: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>WOFS Student ID (if known)</label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Optional"
                      value={manualForm.wofsStudentIdInput}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, wofsStudentIdInput: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Contact Email for Approval *</label>
                    <input
                      type="email"
                      className={styles.input}
                      placeholder="Your active email"
                      value={manualForm.contactEmail}
                      onChange={(e) => setManualForm({ ...manualForm, contactEmail: e.target.value })}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Contact Phone Number *</label>
                    <input
                      type="tel"
                      className={styles.input}
                      placeholder="e.g. 0803..."
                      value={manualForm.contactPhone}
                      onChange={(e) => setManualForm({ ...manualForm, contactPhone: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Reason for Manual Verification *</label>
                  <select
                    className={styles.input}
                    value={manualForm.reasonForManual}
                    onChange={(e) => setManualForm({ ...manualForm, reasonForManual: e.target.value })}
                  >
                    <option value="Guardian email/phone is not yet recorded on school file">
                      Guardian email/phone is not yet recorded on school file
                    </option>
                    <option value="Guardian changed phone number or email address">
                      Guardian changed phone number or email address
                    </option>
                    <option value="Did not receive or lost registration invitation slip">
                      Did not receive or lost registration invitation slip
                    </option>
                    <option value="Returning student awaiting class record update">
                      Returning student awaiting class record update
                    </option>
                  </select>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Desired Password *</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      className={styles.input}
                      placeholder="••••••••"
                      value={manualForm.password}
                      onChange={(e) => setManualForm({ ...manualForm, password: e.target.value })}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Confirm Password *</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      className={styles.input}
                      placeholder="••••••••"
                      value={manualForm.confirmPassword}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, confirmPassword: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                <button type="submit" className={styles.button} disabled={loading}>
                  {loading ? "Submitting Verification Request..." : "Submit for Admin Verification"}
                </button>
              </form>
            )}
          </>
        )}

        <div className={styles.footerLinks}>
          <Link href="/portal/login" className={styles.link}>
            Already claimed your account? Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ padding: "3rem", textAlign: "center" }}>Loading registration portal...</div>}>
      <RegisterFormContent />
    </Suspense>
  );
}
