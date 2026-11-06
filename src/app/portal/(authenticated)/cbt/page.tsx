"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EXAM_TYPES, SUBJECTS } from "@/lib/cbt-constants";
import styles from "./page.module.css";
import {
  getCbtStudentStatus,
  startAttempt,
  getCbtIntegrityDashboard,
  liftCbtDayLock,
} from "@/app/actions/cbt";
import {
  FiShield,
  FiLock,
  FiUnlock,
  FiAlertTriangle,
  FiClock,
  FiCheckCircle,
  FiPlay,
} from "react-icons/fi";

export default function CBTLandingPage() {
  const router = useRouter();
  const [exam, setExam] = useState(EXAM_TYPES[0]);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [amount, setAmount] = useState(10);
  const [mode, setMode] = useState<"PRACTICE" | "MOCK">("PRACTICE");
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [studentStatus, setStudentStatus] = useState<any>(null);
  const [integrityData, setIntegrityData] = useState<any>(null);
  const [liftingId, setLiftingId] = useState<string | null>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    const res = await getCbtStudentStatus();
    if (res.success) {
      setStudentStatus(res);
      if (res.isStaffSupervisor) {
        const staffRes = await getCbtIntegrityDashboard();
        if (staffRes.success) {
          setIntegrityData(staffRes);
        }
      }
    }
    setStatusLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!acceptedRules) {
      setErrorMsg("You must read and accept the CBT Exam Integrity Rules before starting an attempt.");
      return;
    }

    setIsLoading(true);
    const res = await startAttempt({
      subjectCode: subject,
      examBody: exam,
      mode,
      questionCount: amount,
    });

    if (res.success && res.attemptId) {
      router.push(`/portal/cbt/quiz?attemptId=${encodeURIComponent(res.attemptId)}`);
    } else {
      setErrorMsg(res.error || "Unable to start CBT attempt.");
      setIsLoading(false);
      loadStatus();
    }
  };

  const handleLiftLock = async (lockId: string) => {
    const reason = prompt(
      "Enter mandatory written reason for lifting this student's CBT Day Lock (Audited in hash-chained AuditLog):"
    );
    if (!reason || reason.trim().length < 5) return;

    setLiftingId(lockId);
    const res = await liftCbtDayLock(lockId, reason.trim());
    if (res.success) {
      await loadStatus();
    } else {
      alert(res.error || "Failed to lift CBT Day Lock.");
    }
    setLiftingId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.heroSection}>
        <h1 className={styles.title}>Word of Faith CBT & Integrity Suite</h1>
        <p className={styles.subtitle}>
          Server-authoritative WAEC, NECO & UTME examination environment with one-question-at-a-time delivery and 2-strike integrity protection.
        </p>
      </div>

      {/* Active Day-Lock Alert Banner */}
      {studentStatus?.isLocked && (
        <div
          style={{
            background: "#fef2f2",
            border: "2px solid #ef4444",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "2rem",
            color: "#991b1b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontWeight: 800, fontSize: "1.15rem", marginBottom: "0.5rem" }}>
            <FiLock size={22} /> CBT ACCESS LOCKED FOR TODAY ({studentStatus.dayKey} · Africa/Lagos)
          </div>
          <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5 }}>
            <strong>Reason:</strong> {studentStatus.lockReason}
          </p>
          <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.85rem", color: "#b91c1c" }}>
            To resume testing today, a Subject Teacher, Form Master, or the School Principal must review and lift this lock with a recorded reason.
          </p>
        </div>
      )}

      {/* Resume Active Attempt Banner */}
      {!studentStatus?.isLocked && studentStatus?.activeAttemptId && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #3b82f6",
            borderRadius: "12px",
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <strong style={{ color: "#1e3a8a", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiClock /> Active CBT Attempt in Progress
            </strong>
            <span style={{ fontSize: "0.88rem", color: "#1e40af" }}>
              You have an unsubmitted attempt currently running on the server clock.
            </span>
          </div>
          <button
            onClick={() => router.push(`/portal/cbt/quiz?attemptId=${studentStatus.activeAttemptId}`)}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <FiPlay /> Resume Active Attempt
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            marginBottom: "1.5rem",
            fontWeight: 600,
          }}
        >
          {errorMsg}
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Configure New CBT Session</h2>
        <form onSubmit={handleStart} className={styles.form}>
          <div className={styles.formGroup}>
            <label>Examination Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "PRACTICE" | "MOCK")}
              required
            >
              <option value="PRACTICE">Practice Mode (Home / Self-Paced Study)</option>
              <option value="MOCK">Supervised Mock Mode (School ICT Lab / Strict Fullscreen)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Exam Body</label>
            <select value={exam} onChange={(e) => setExam(e.target.value)} required>
              {EXAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} required>
              {SUBJECTS.map((sub) => (
                <option key={sub} value={sub}>
                  {sub.charAt(0).toUpperCase() + sub.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Number of Questions</label>
            <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} required>
              <option value={10}>10 Questions (10 Mins)</option>
              <option value={20}>20 Questions (20 Mins)</option>
              <option value={40}>40 Questions (40 Mins)</option>
            </select>
          </div>

          {/* Mandatory Integrity Rules Acceptance (Section 7.3) */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "1rem",
              fontSize: "0.85rem",
              color: "#334155",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <FiShield color="#15803d" /> Exam Integrity & Anti-Malpractice Policy (2-Strike Rule)
            </div>
            <ul style={{ margin: "0 0 0.75rem 1.2rem", padding: 0 }}>
              <li>Questions are delivered <strong>one at a time</strong> from the server; answer keys are isolated until final submission.</li>
              <li>Your name, admission number, and attempt ID are dynamically watermarked across the exam screen.</li>
              <li><strong>Strike 1:</strong> Switching tabs, minimizing the browser for more than 3 seconds, or exiting fullscreen triggers a 10-second warning.</li>
              <li><strong>Strike 2:</strong> A second violation immediately terminates your attempt and locks your CBT access for the remainder of the Lagos calendar day.</li>
            </ul>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>
              <input
                type="checkbox"
                checked={acceptedRules}
                onChange={(e) => setAcceptedRules(e.target.checked)}
              />
              I understand and accept the Word of Faith Schools CBT Integrity Rules.
            </label>
          </div>

          <button
            type="submit"
            className={styles.startBtn}
            disabled={isLoading || statusLoading || Boolean(studentStatus?.isLocked)}
          >
            {studentStatus?.isLocked
              ? "Locked for Today (See Notice Above)"
              : isLoading
              ? "Initializing Server Attempt..."
              : "Start Protected CBT Session"}
          </button>
        </form>
      </div>

      {/* Staff Supervisor Panel: Lift Day Locks & Inspect Integrity Signals */}
      {studentStatus?.isStaffSupervisor && integrityData && (
        <div
          style={{
            marginTop: "2.5rem",
            background: "white",
            borderRadius: "12px",
            padding: "1.75rem",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ color: "#0A2540", margin: "0 0 0.5rem 0", fontSize: "1.3rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiShield color="#16a34a" /> Staff CBT Integrity & Day-Lock Supervisor
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
            Teachers, Form Masters, and the Principal can review automatic 2-strike day locks and lift them with a mandatory audited reason.
          </p>

          <h4 style={{ color: "#0A2540", marginBottom: "0.75rem" }}>
            Student Day Locks ({integrityData.activeLocks?.length || 0})
          </h4>
          {!integrityData.activeLocks || integrityData.activeLocks.length === 0 ? (
            <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", color: "#64748b", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
              No students are currently day-locked.
            </div>
          ) : (
            <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Student</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Lagos Day</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Violation Reason</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Status</th>
                    <th style={{ padding: "0.75rem", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {integrityData.activeLocks.map((lk: any) => (
                    <tr key={lk.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.75rem", fontWeight: 600 }}>
                        {lk.student?.PreferredName || lk.student?.AdmissionNo} ({lk.student?.AdmissionNo})
                      </td>
                      <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{lk.dayKey}</td>
                      <td style={{ padding: "0.75rem", color: "#b91c1c" }}>{lk.reason}</td>
                      <td style={{ padding: "0.75rem" }}>
                        {lk.liftedAt ? (
                          <span style={{ color: "#15803d", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            <FiCheckCircle /> Lifted ({lk.liftReason})
                          </span>
                        ) : (
                          <span style={{ color: "#dc2626", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            <FiAlertTriangle /> Locked
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>
                        {!lk.liftedAt && (
                          <button
                            onClick={() => handleLiftLock(lk.id)}
                            disabled={liftingId === lk.id}
                            className="btn btn-outline"
                            style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                          >
                            <FiUnlock /> Lift Day Lock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
