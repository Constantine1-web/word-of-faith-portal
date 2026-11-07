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

const QUANTITATIVE_SUBJECTS = new Set([
  "mathematics",
  "physics",
  "chemistry",
  "accounting",
  "commerce",
  "economics",
]);

function formatAllocatedDuration(questionCount: number, secondsPerQuestion: number): string {
  const totalSec = questionCount * secondsPerQuestion;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (secs === 0) return `${mins} Mins`;
  return `${mins} Mins ${secs} Secs`;
}

export default function CBTLandingPage() {
  const router = useRouter();
  const [exam, setExam] = useState(EXAM_TYPES[0]);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [amount, setAmount] = useState(10);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState<60 | 90>(
    QUANTITATIVE_SUBJECTS.has(SUBJECTS[0].toLowerCase()) ? 90 : 60
  );
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

  const handleSubjectChange = (newSubject: string) => {
    setSubject(newSubject);
    if (QUANTITATIVE_SUBJECTS.has(newSubject.toLowerCase())) {
      setSecondsPerQuestion(90);
    } else {
      setSecondsPerQuestion(60);
    }
  };

  const handleModeChange = (newMode: "PRACTICE" | "MOCK") => {
    setMode(newMode);
    setAcceptedRules(false);
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!acceptedRules) {
      setErrorMsg("You must read and accept the CBT Examination Rules, Terms & Conditions before starting.");
      return;
    }

    setIsLoading(true);
    const res = await startAttempt({
      subjectCode: subject,
      examBody: exam,
      mode,
      questionCount: amount,
      secondsPerQuestion,
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

  const allocatedTimeLabel = formatAllocatedDuration(amount, secondsPerQuestion);
  const canClickStart =
    acceptedRules && !isLoading && !statusLoading && !studentStatus?.isLocked;

  return (
    <div className={styles.container}>
      <div className={styles.heroSection}>
        <h1 className={styles.title}>Word of Faith CBT & Integrity Suite</h1>
        <p className={styles.subtitle}>
          Server-authoritative WAEC, NECO & UTME examination environment with dynamic question-based time allocation, self-paced practice, and supervised mock examination modes.
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
              You have an unsubmitted attempt currently running on the server clock. You can resume it or configure a new session below.
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
              onChange={(e) => handleModeChange(e.target.value as "PRACTICE" | "MOCK")}
              required
            >
              <option value="PRACTICE">Self-Paced Practice Mode (Flexible Study · No Strike Lockouts)</option>
              <option value="MOCK">Strict Exam Mode (Supervised Mock · Fullscreen & 2-Strike Rule)</option>
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
            <select value={subject} onChange={(e) => handleSubjectChange(e.target.value)} required>
              {SUBJECTS.map((sub) => (
                <option key={sub} value={sub}>
                  {sub.charAt(0).toUpperCase() + sub.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Time Allocation Per Question</label>
            <select
              value={secondsPerQuestion}
              onChange={(e) => setSecondsPerQuestion(Number(e.target.value) as 60 | 90)}
              required
            >
              <option value={60}>1 Minute (60 Secs) per Question — Standard Objective Pace</option>
              <option value={90}>1 Minute 30 Seconds (90 Secs) per Question — Calculation / Extended Pace</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>Number of Questions</label>
            <select value={amount} onChange={(e) => setAmount(Number(e.target.value))} required>
              {[5, 10, 15, 20, 25, 30, 40, 50].map((qCount) => (
                <option key={qCount} value={qCount}>
                  {qCount} Questions ({formatAllocatedDuration(qCount, secondsPerQuestion)} Allocated)
                </option>
              ))}
            </select>
          </div>

          {/* Live Dynamic Time Allocation Summary Badge */}
          <div
            style={{
              background: mode === "MOCK" ? "#fefce8" : "#f0fdf4",
              border: `1px solid ${mode === "MOCK" ? "#fde047" : "#86efac"}`,
              borderRadius: "10px",
              padding: "0.9rem 1.1rem",
              fontSize: "0.86rem",
              color: "#1e293b",
              display: "flex",
              flexDirection: "column",
              gap: "0.3rem",
            }}
          >
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", color: "#0f172a" }}>
              <FiClock color={mode === "MOCK" ? "#ca8a04" : "#16a34a"} /> Session Time & Question Summary
            </div>
            <div>
              <strong>Questions Selected:</strong> {amount} Questions ({subject.toUpperCase()} · {exam.toUpperCase()})
            </div>
            <div>
              <strong>Time Rate:</strong>{" "}
              {secondsPerQuestion === 90 ? "1 Minute 30 Seconds (90s)" : "1 Minute 00 Seconds (60s)"} per question
            </div>
            <div>
              <strong>Total Allocated Time:</strong>{" "}
              <span style={{ fontWeight: 800, color: "#15803d" }}>{allocatedTimeLabel}</span>{" "}
              {mode === "PRACTICE"
                ? "(Self-Paced Study — No Strike Penalties)"
                : "(Strict Server Timer — Auto-Submits at 00:00)"}
            </div>
          </div>

          {/* Comprehensive Rules, Regulations & Terms Acceptance (Section 7.3) */}
          <div
            style={{
              background: "#f8fafc",
              border: `2px solid ${acceptedRules ? "#16a34a" : "#cbd5e1"}`,
              borderRadius: "10px",
              padding: "1.15rem",
              fontSize: "0.85rem",
              color: "#334155",
              lineHeight: 1.55,
              transition: "border-color 0.2s ease",
            }}
          >
            <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.92rem" }}>
              <FiShield color={mode === "MOCK" ? "#dc2626" : "#15803d"} />{" "}
              {mode === "MOCK"
                ? "Strict Exam Mode Rules & Anti-Malpractice Regulations (Read Carefully)"
                : "Self-Paced Practice Rules & Examination Instructions (Read Carefully)"}
            </div>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.82rem", color: "#475569" }}>
              Please read through the following examination rules and regulations carefully before starting so you do not encounter any issues during your session:
            </p>
            <ul style={{ margin: "0 0 0.85rem 1.2rem", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <li>
                <strong>Question Delivery & Auto-Save:</strong> You have selected <strong>{amount} questions</strong>. Questions are delivered one at a time from the server, and every option you select is saved automatically.
              </li>
              <li>
                <strong>Allocated Timer ({allocatedTimeLabel}):</strong> Your timer is calculated directly from your question count ({secondsPerQuestion === 90 ? "1 min 30 secs" : "1 min"} per question). When the timer reaches <code>00:00</code>, your answered questions are automatically graded.
              </li>
              {mode === "MOCK" ? (
                <>
                  <li style={{ color: "#991b1b" }}>
                    <strong>Strict Exam Mode Active (Strike 1 Warning):</strong> Switching browser tabs, minimizing the window for more than 3 seconds, or exiting fullscreen triggers an immediate 10-second warning.
                  </li>
                  <li style={{ color: "#991b1b" }}>
                    <strong>Strike 2 Termination & Day-Lock:</strong> A second violation in Strict Exam Mode immediately terminates the exam and locks CBT access for the remainder of the day.
                  </li>
                </>
              ) : (
                <li style={{ color: "#15803d" }}>
                  <strong>Self-Paced Practice Mode Active:</strong> Strict anti-malpractice tab/fullscreen lockouts are <strong>disabled</strong> in this mode. You may study at your own pace, switch tabs freely without strike penalties, and review AI explanations upon submission.
                </li>
              )}
            </ul>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
                fontWeight: 700,
                cursor: "pointer",
                color: "#0f172a",
                background: acceptedRules ? "#dcfce7" : "#f1f5f9",
                padding: "0.65rem 0.85rem",
                borderRadius: "8px",
                border: `1px solid ${acceptedRules ? "#86efac" : "#cbd5e1"}`,
              }}
            >
              <input
                type="checkbox"
                checked={acceptedRules}
                onChange={(e) => setAcceptedRules(e.target.checked)}
                style={{ marginTop: "0.2rem", width: "16px", height: "16px", cursor: "pointer" }}
              />
              <span>
                I have read, understood, and accept the Word of Faith Schools CBT Rules, Terms &amp; Conditions.
              </span>
            </label>
          </div>

          <button
            type="submit"
            className={styles.startBtn}
            disabled={!canClickStart}
            aria-disabled={!canClickStart}
            style={
              !canClickStart
                ? {
                    backgroundColor: "#94a3b8",
                    color: "#f8fafc",
                    opacity: 0.6,
                    cursor: "not-allowed",
                    boxShadow: "none",
                  }
                : undefined
            }
          >
            {studentStatus?.isLocked
              ? "Locked for Today (See Notice Above)"
              : isLoading
              ? "Initializing Server Attempt..."
              : !acceptedRules
              ? "Accept Terms & Conditions Above to Start Exam"
              : mode === "MOCK"
              ? `Start Strict Timed Exam (${amount} Qs · ${allocatedTimeLabel})`
              : `Start Self-Paced Practice (${amount} Qs · ${allocatedTimeLabel})`}
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
