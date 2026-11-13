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
  getCompletedAttemptReview,
  getAttemptAiAnalysis,
} from "@/app/actions/cbt";
import { getCbtAnalyticsAndLeaderboard } from "@/app/actions/elearning";
import {
  FiShield,
  FiLock,
  FiUnlock,
  FiAlertTriangle,
  FiClock,
  FiCheckCircle,
  FiPlay,
  FiBarChart2,
  FiBookOpen,
  FiX,
  FiCpu,
  FiAward,
  FiTrendingUp,
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
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Past Attempt Review & AI Tutor state
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  const loadStatus = async () => {
    setStatusLoading(true);
    const [res, analyticsRes] = await Promise.all([
      getCbtStudentStatus(),
      getCbtAnalyticsAndLeaderboard(),
    ]);
    if (analyticsRes.success) {
      setAnalyticsData(analyticsRes);
    }
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

  const handleOpenReview = async (attemptId: string) => {
    setReviewLoadingId(attemptId);
    setAiAnalysis(null);
    const res = await getCompletedAttemptReview(attemptId);
    if (res.success) {
      setSelectedReview(res);
    } else {
      alert(res.error || "Unable to load attempt review.");
    }
    setReviewLoadingId(null);
  };

  const handleRunAiTutor = async (attemptId: string) => {
    setAiLoading(true);
    const res = await getAttemptAiAnalysis(attemptId);
    if (res.success) {
      setAiAnalysis(res.analysis);
    } else {
      alert(res.error || "Unable to generate AI diagnostic analysis.");
    }
    setAiLoading(false);
  };

  const allocatedTimeLabel = formatAllocatedDuration(amount, secondsPerQuestion);
  const canClickStart =
    acceptedRules && !isLoading && !statusLoading && !studentStatus?.isLocked;

  const pastAttempts: any[] = (studentStatus?.recentAttempts || []).filter(
    (a: any) => a.status !== "ACTIVE"
  );
  const completedScores = pastAttempts
    .filter((a: any) => typeof a.scoreTenths === "number")
    .map((a: any) => Math.round(a.scoreTenths / 10));
  const avgScore =
    completedScores.length > 0
      ? Math.round(completedScores.reduce((acc, v) => acc + v, 0) / completedScores.length)
      : 0;
  const bestScore = completedScores.length > 0 ? Math.max(...completedScores) : 0;

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
            background: "var(--badge-danger-bg)",
            border: "2px solid #ef4444",
            borderRadius: "12px",
            padding: "1.25rem",
            marginBottom: "1rem",
            color: "var(--badge-danger-text)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontWeight: 800, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            <FiLock size={22} /> CBT ACCESS LOCKED FOR TODAY ({studentStatus.dayKey} · Africa/Lagos)
          </div>
          <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.5 }}>
            <strong>Reason:</strong> {studentStatus.lockReason}
          </p>
          <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.85rem", opacity: 0.9 }}>
            To resume testing today, a Subject Teacher, Form Master, or the School Principal must review and lift this lock with a recorded reason.
          </p>
        </div>
      )}

      {/* Resume Active Attempt Banner */}
      {!studentStatus?.isLocked && studentStatus?.activeAttemptId && (
        <div
          style={{
            background: "var(--badge-info-bg)",
            border: "1px solid var(--color-navy-blue)",
            borderRadius: "12px",
            padding: "1.25rem 1.5rem",
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <strong style={{ color: "var(--badge-info-text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiClock /> Active CBT Attempt in Progress
            </strong>
            <span style={{ fontSize: "0.88rem", color: "var(--color-gray-800)" }}>
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
            background: "var(--badge-danger-bg)",
            color: "var(--badge-danger-text)",
            padding: "1rem 1.25rem",
            borderRadius: "8px",
            marginBottom: "1rem",
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
              background: mode === "MOCK" ? "var(--badge-warn-bg)" : "var(--badge-success-bg)",
              border: `1px solid ${mode === "MOCK" ? "#eab308" : "var(--color-primary-green)"}`,
              borderRadius: "10px",
              padding: "0.9rem 1.1rem",
              fontSize: "0.86rem",
              color: "var(--color-gray-900)",
              display: "flex",
              flexDirection: "column",
              gap: "0.3rem",
            }}
          >
            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--color-gray-900)" }}>
              <FiClock color={mode === "MOCK" ? "#eab308" : "var(--color-primary-green)"} /> Session Time & Question Summary
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
              <span style={{ fontWeight: 800, color: "var(--badge-success-text)" }}>{allocatedTimeLabel}</span>{" "}
              {mode === "PRACTICE"
                ? "(Self-Paced Study — No Strike Penalties)"
                : "(Strict Server Timer — Auto-Submits at 00:00)"}
            </div>
          </div>

          {/* Comprehensive Rules, Regulations & Terms Acceptance (Section 7.3) */}
          <div
            style={{
              background: "var(--surface-subtle)",
              border: `2px solid ${acceptedRules ? "var(--color-primary-green)" : "var(--color-gray-300)"}`,
              borderRadius: "10px",
              padding: "1.15rem",
              fontSize: "0.85rem",
              color: "var(--color-gray-800)",
              lineHeight: 1.55,
              transition: "border-color 0.2s ease",
            }}
          >
            <div style={{ fontWeight: 800, color: "var(--color-gray-900)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.92rem" }}>
              <FiShield color={mode === "MOCK" ? "#ef4444" : "var(--color-primary-green)"} />{" "}
              {mode === "MOCK"
                ? "Strict Exam Mode Rules & Anti-Malpractice Regulations (Read Carefully)"
                : "Self-Paced Practice Rules & Examination Instructions (Read Carefully)"}
            </div>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.82rem", color: "var(--color-gray-600)" }}>
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
                  <li style={{ color: "var(--badge-danger-text)" }}>
                    <strong>Strict Exam Mode Active (Strike 1 Warning):</strong> Switching browser tabs, minimizing the window for more than 3 seconds, or exiting fullscreen triggers an immediate 10-second warning.
                  </li>
                  <li style={{ color: "var(--badge-danger-text)" }}>
                    <strong>Strike 2 Termination & Day-Lock:</strong> A second violation in Strict Exam Mode immediately terminates the exam and locks CBT access for the remainder of the day.
                  </li>
                </>
              ) : (
                <li style={{ color: "var(--badge-success-text)" }}>
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
                color: "var(--color-gray-900)",
                background: acceptedRules ? "var(--badge-success-bg)" : "var(--color-gray-100)",
                padding: "0.65rem 0.85rem",
                borderRadius: "8px",
                border: `1px solid ${acceptedRules ? "var(--color-primary-green)" : "var(--color-gray-300)"}`,
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

      {/* Past CBT Attempts & Performance History Dashboard */}
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          minWidth: 0,
          margin: "1.5rem auto 0 auto",
          background: "var(--color-white)",
          borderRadius: "12px",
          padding: "clamp(1rem, 3vw, 2rem)",
          border: "1px solid var(--color-gray-200)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                color: "var(--color-navy-blue)",
                margin: "0 0 0.3rem 0",
                fontSize: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <FiBarChart2 color="var(--color-primary-green)" /> Past CBT Attempts &amp; Performance History
            </h2>
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.86rem", margin: 0 }}>
              Review your completed Self-Paced Practice and Strict Exam attempts, inspect explanations, and run AI Tutor diagnostics.
            </p>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 155px), 1fr))",
            gap: "0.85rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              background: "var(--surface-subtle)",
              border: "1px solid var(--color-gray-200)",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", fontWeight: 600, textTransform: "uppercase" }}>
              Completed Sessions
            </div>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--color-gray-900)", marginTop: "0.2rem" }}>
              {pastAttempts.length}
            </div>
          </div>
          <div
            style={{
              background: "var(--badge-success-bg)",
              border: "1px solid var(--color-gray-200)",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--badge-success-text)", fontWeight: 600, textTransform: "uppercase" }}>
              Average Score
            </div>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--badge-success-text)", marginTop: "0.2rem" }}>
              {avgScore}%
            </div>
          </div>
          <div
            style={{
              background: "var(--badge-info-bg)",
              border: "1px solid var(--color-gray-200)",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--badge-info-text)", fontWeight: 600, textTransform: "uppercase" }}>
              Highest Score
            </div>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--badge-info-text)", marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <FiAward size={18} /> {bestScore}%
            </div>
          </div>
          <div
            style={{
              background: "var(--badge-warn-bg)",
              border: "1px solid var(--color-gray-200)",
              borderRadius: "10px",
              padding: "0.9rem 1rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--badge-warn-text)", fontWeight: 600, textTransform: "uppercase" }}>
              Practice / Strict Split
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--badge-warn-text)", marginTop: "0.35rem" }}>
              {pastAttempts.filter((a) => a.mode !== "MOCK").length} Practice ·{" "}
              {pastAttempts.filter((a) => a.mode === "MOCK").length} Exam
            </div>
          </div>
        </div>

        {/* Track C: Subject Mastery Breakdown, Achievement Badges & Class Leaderboard */}
        {analyticsData && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "1.75rem", minWidth: 0 }}>
            {/* Earned Achievement Badges */}
            {Array.isArray(analyticsData.badges) && analyticsData.badges.length > 0 && (
              <div
                style={{
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--color-gray-200)",
                  borderRadius: "12px",
                  padding: "1.1rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
                  <h3 style={{ margin: 0, fontSize: "0.96rem", color: "var(--color-gray-900)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <FiAward color="#d97706" /> CBT Achievement Badges &amp; Milestones
                  </h3>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--badge-success-text)", background: "var(--badge-success-bg)", padding: "0.2rem 0.6rem", borderRadius: "999px" }}>
                    {analyticsData.badges.filter((b: any) => b.earned).length} / {analyticsData.badges.length} Unlocked
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "0.75rem" }}>
                  {analyticsData.badges.map((badge: any) => (
                    <div
                      key={badge.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.7rem 0.85rem",
                        borderRadius: "10px",
                        background: badge.earned ? "var(--color-white)" : "var(--color-gray-100)",
                        border: `1px solid ${badge.earned ? "var(--color-primary-green)" : "var(--color-gray-200)"}`,
                        opacity: badge.earned ? 1 : 0.7,
                      }}
                    >
                      <div style={{ fontSize: "1.5rem" }}>{badge.icon}</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "0.84rem", color: badge.earned ? "var(--color-gray-900)" : "var(--color-gray-500)" }}>
                          {badge.title} {badge.earned && "✓"}
                        </div>
                        <div style={{ fontSize: "0.74rem", color: "var(--color-gray-500)", lineHeight: 1.35 }}>
                          {badge.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subject Mastery Breakdown & Top Performers Leaderboard Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "1.25rem", minWidth: 0 }}>
              {/* Subject Mastery Breakdown */}
              <div
                style={{
                  background: "var(--color-white)",
                  border: "1px solid var(--color-gray-200)",
                  borderRadius: "12px",
                  padding: "1.1rem 1.25rem",
                  minWidth: 0,
                }}
              >
                <h3 style={{ margin: "0 0 0.85rem 0", fontSize: "0.96rem", color: "var(--color-gray-900)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <FiTrendingUp color="var(--color-primary-green)" /> Subject Mastery &amp; Speed Breakdown
                </h3>
                {!analyticsData.subjectBreakdown || analyticsData.subjectBreakdown.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--color-gray-500)" }}>
                    Complete at least one CBT session to unlock your per-subject mastery and response speed metrics.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {analyticsData.subjectBreakdown.map((sub: any) => (
                      <div key={sub.subject} style={{ background: "var(--surface-subtle)", padding: "0.7rem 0.9rem", borderRadius: "8px", border: "1px solid var(--color-gray-200)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.35rem" }}>
                          <span style={{ fontWeight: 800, color: "var(--color-gray-900)", textTransform: "capitalize", fontSize: "0.88rem" }}>
                            {sub.subject}
                          </span>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: sub.avgScore >= 70 ? "var(--badge-success-text)" : sub.avgScore >= 50 ? "var(--badge-warn-text)" : "var(--badge-danger-text)" }}>
                            Avg: {sub.avgScore}% · Best: {sub.bestScore}%
                          </span>
                        </div>
                        <div style={{ height: "7px", background: "var(--color-gray-200)", borderRadius: "999px", overflow: "hidden", marginBottom: "0.35rem" }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(5, sub.avgScore))}%`,
                              height: "100%",
                              background: sub.avgScore >= 70 ? "#16a34a" : sub.avgScore >= 50 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.25rem", fontSize: "0.74rem", color: "var(--color-gray-500)" }}>
                          <span>{sub.attemptsCount} Sessions ({sub.totalQuestions} Qs)</span>
                          <span>⚡ Avg Pace: {sub.avgSecsPerQuestion}s / question</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Performers Leaderboard */}
              <div
                style={{
                  background: "var(--color-white)",
                  border: "1px solid var(--color-gray-200)",
                  borderRadius: "12px",
                  padding: "1.1rem 1.25rem",
                  minWidth: 0,
                }}
              >
                <h3 style={{ margin: "0 0 0.85rem 0", fontSize: "0.96rem", color: "var(--color-gray-900)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  🏆 School CBT Honour Roll (Top Performers)
                </h3>
                {!analyticsData.leaderboard || analyticsData.leaderboard.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--color-gray-500)" }}>
                    No leaderboard rankings recorded yet. Be the first to post a top score!
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                    {analyticsData.leaderboard.slice(0, 6).map((row: any) => (
                      <div
                        key={row.rank}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.55rem 0.8rem",
                          borderRadius: "8px",
                          background: row.isCurrentUser ? "var(--badge-success-bg)" : "var(--surface-subtle)",
                          border: `1px solid ${row.isCurrentUser ? "var(--color-primary-green)" : "var(--color-gray-200)"}`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0 }}>
                          <span
                            style={{
                              width: "24px",
                              height: "24px",
                              flexShrink: 0,
                              borderRadius: "999px",
                              background: row.rank === 1 ? "#fef08a" : row.rank === 2 ? "#e2e8f0" : row.rank === 3 ? "#fed7aa" : "#cbd5e1",
                              color: "#0A2540",
                              fontWeight: 800,
                              fontSize: "0.78rem",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {row.rank}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: "var(--color-gray-900)" }}>
                              {row.displayName} {row.isCurrentUser && <span style={{ color: "var(--badge-success-text)", fontWeight: 800 }}>(You)</span>}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--color-gray-500)" }}>
                              {row.attempts} Sessions · Best: {row.bestPct}%
                            </div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: "0.84rem",
                            color: "var(--badge-success-text)",
                            background: "var(--badge-success-bg)",
                            padding: "0.2rem 0.55rem",
                            borderRadius: "999px",
                            flexShrink: 0,
                          }}
                        >
                          {row.avgPct}% Avg
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {statusLoading ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-gray-500)", fontSize: "0.9rem" }}>
            Loading past CBT attempts...
          </div>
        ) : pastAttempts.length === 0 ? (
          <div
            style={{
              padding: "2rem 1rem",
              background: "var(--surface-subtle)",
              borderRadius: "10px",
              textAlign: "center",
              color: "var(--color-gray-500)",
              fontSize: "0.9rem",
              border: "1px dashed var(--color-gray-300)",
            }}
          >
            No completed CBT attempts yet. Configure and start a Self-Paced Practice or Timed Exam session above!
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginBottom: "0.5rem", fontWeight: 600 }}>
              Tip: Swipe left/right on the table below to view all columns and review buttons.
            </div>
            <div className="table-scroll" style={{ borderRadius: "8px", border: "1px solid var(--color-gray-200)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem", minWidth: "660px" }}>
                <thead>
                  <tr style={{ background: "var(--color-gray-100)", borderBottom: "2px solid var(--color-gray-300)", textAlign: "left", color: "var(--color-gray-900)" }}>
                    <th style={{ padding: "0.75rem" }}>Date</th>
                    <th style={{ padding: "0.75rem" }}>Subject &amp; Exam</th>
                    <th style={{ padding: "0.75rem" }}>Mode</th>
                    <th style={{ padding: "0.75rem", textAlign: "center" }}>Questions</th>
                    <th style={{ padding: "0.75rem", textAlign: "center" }}>Score</th>
                    <th style={{ padding: "0.75rem", textAlign: "center" }}>Status</th>
                    <th style={{ padding: "0.75rem", textAlign: "right" }}>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {pastAttempts.map((att: any) => {
                    const pct =
                      typeof att.scoreTenths === "number" ? Math.round(att.scoreTenths / 10) : 0;
                    const isMock = att.mode === "MOCK";
                    const isTerminated = att.status === "TERMINATED";
                    const scoreColor =
                      pct >= 70 ? "var(--badge-success-text)" : pct >= 50 ? "var(--badge-warn-text)" : "var(--badge-danger-text)";
                    const scoreBg =
                      pct >= 70 ? "var(--badge-success-bg)" : pct >= 50 ? "var(--badge-warn-bg)" : "var(--badge-danger-bg)";

                    return (
                      <tr key={att.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                        <td style={{ padding: "0.75rem", color: "var(--color-gray-600)", whiteSpace: "nowrap" }}>
                          {new Date(att.startedAt).toLocaleDateString("en-NG", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
                            {new Date(att.startedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem", fontWeight: 700, color: "var(--color-gray-900)", textTransform: "capitalize" }}>
                          {att.subjectCode}
                          <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
                            {att.examBody}
                          </div>
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "999px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              background: isMock ? "var(--badge-info-bg)" : "var(--badge-success-bg)",
                              color: isMock ? "var(--badge-info-text)" : "var(--badge-success-text)",
                              border: "1px solid var(--color-gray-200)",
                            }}
                          >
                            {isMock ? "Strict Exam" : "Self-Paced"}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center", fontWeight: 600, color: "var(--color-gray-800)" }}>
                          {att.questionCount} Qs
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          {isTerminated ? (
                            <span style={{ color: "var(--badge-danger-text)", fontWeight: 700, fontSize: "0.78rem" }}>
                              —
                            </span>
                          ) : (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.25rem 0.65rem",
                                borderRadius: "999px",
                                fontWeight: 800,
                                fontSize: "0.82rem",
                                background: scoreBg,
                                color: scoreColor,
                              }}
                            >
                              {pct}%
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: isTerminated ? "var(--badge-danger-text)" : "var(--badge-success-text)",
                            }}
                          >
                            {att.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenReview(att.id)}
                            disabled={reviewLoadingId === att.id}
                            style={{
                              background: "var(--color-navy-blue)",
                              color: "var(--btn-primary-text, #ffffff)",
                              border: "none",
                              borderRadius: "8px",
                              padding: "0.42rem 0.8rem",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                            }}
                          >
                            <FiBookOpen size={13} />
                            {reviewLoadingId === att.id ? "Loading..." : "Review & AI Tutor"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Interactive Past Attempt Review & AI Diagnostic Drawer */}
        {selectedReview && selectedReview.summary && (
          <div
            style={{
              marginTop: "1.75rem",
              borderTop: "2px solid var(--color-gray-200)",
              paddingTop: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "1rem",
                background: "var(--surface-subtle)",
                padding: "1.1rem 1.25rem",
                borderRadius: "10px",
                border: "1px solid var(--color-gray-200)",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-primary-green)", textTransform: "uppercase" }}>
                  Completed Attempt Review · {selectedReview.summary.examBody}
                </div>
                <h3 style={{ margin: "0.2rem 0", color: "var(--color-gray-900)", textTransform: "capitalize", fontSize: "1.2rem" }}>
                  {selectedReview.summary.subjectCode} — Score: {selectedReview.summary.correctCount} /{" "}
                  {selectedReview.summary.questionCount} ({selectedReview.summary.percentage}%)
                </h3>
                <div style={{ fontSize: "0.82rem", color: "var(--color-gray-500)" }}>
                  Mode:{" "}
                  <strong>
                    {selectedReview.summary.mode === "MOCK" ? "Strict Timed Exam" : "Self-Paced Practice"}
                  </strong>{" "}
                  · Time Spent:{" "}
                  <strong>
                    {Math.floor((selectedReview.summary.durationSpentSec || 60) / 60)}m{" "}
                    {(selectedReview.summary.durationSpentSec || 0) % 60}s
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleRunAiTutor(selectedReview.summary.attemptId)}
                  disabled={aiLoading}
                  style={{
                    background: "linear-gradient(135deg, #16a34a, #15803d)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 0.95rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <FiCpu size={15} />
                  {aiLoading ? "Analyzing with AI Tutor..." : "Run AI Tutor Breakdown"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReview(null);
                    setAiAnalysis(null);
                  }}
                  style={{
                    background: "var(--color-gray-200)",
                    color: "var(--color-gray-900)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <FiX size={15} /> Close Review
                </button>
              </div>
            </div>

            {/* AI Tutor Diagnostic Card */}
            {aiAnalysis && (
              <div
                style={{
                  background: "var(--badge-success-bg)",
                  border: "1px solid var(--color-primary-green)",
                  borderRadius: "10px",
                  padding: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--badge-success-text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiCpu /> Word of Faith AI Diagnostic Tutor
                </h4>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.88rem", color: "var(--color-gray-900)", lineHeight: 1.55 }}>
                  {aiAnalysis.overallSummary}
                </p>
                {Array.isArray(aiAnalysis.ActionableStudyTips) && aiAnalysis.ActionableStudyTips.length > 0 && (
                  <div style={{ fontSize: "0.84rem", color: "var(--color-gray-900)" }}>
                    <strong>Study Recommendations:</strong>
                    <ul style={{ margin: "0.35rem 0 0 0", paddingLeft: "1.2rem" }}>
                      {aiAnalysis.ActionableStudyTips.map((tip: string, idx: number) => (
                        <li key={idx} style={{ marginBottom: "0.25rem" }}>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Question-by-Question Review List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", maxHeight: "520px", overflowY: "auto", paddingRight: "0.25rem" }}>
              {(selectedReview.reviewItems || []).map((item: any) => (
                <div
                  key={item.position}
                  style={{
                    border: `1px solid ${item.isCorrect ? "var(--color-primary-green)" : "#ef4444"}`,
                    background: item.isCorrect ? "var(--badge-success-bg)" : "var(--badge-danger-bg)",
                    borderRadius: "10px",
                    padding: "1rem 1.15rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
                    <span style={{ fontWeight: 800, color: "var(--color-gray-900)", fontSize: "0.88rem" }}>
                      Question {item.position}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        padding: "0.18rem 0.6rem",
                        borderRadius: "999px",
                        background: item.isCorrect ? "#16a34a" : "#dc2626",
                        color: "#ffffff",
                      }}
                    >
                      {item.isCorrect ? "CORRECT" : item.selectedKey ? "INCORRECT" : "UNANSWERED"}
                    </span>
                  </div>
                  <div
                    style={{ fontSize: "0.92rem", color: "var(--color-gray-900)", fontWeight: 600, marginBottom: "0.65rem", lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: item.stem }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "0.45rem", fontSize: "0.83rem" }}>
                    {(item.options || []).map((opt: any) => {
                      const isCorrectOpt = opt.key.toLowerCase() === item.correctKey?.toLowerCase();
                      const isSelectedOpt = opt.key.toLowerCase() === item.selectedKey?.toLowerCase();
                      return (
                        <div
                          key={opt.key}
                          style={{
                            padding: "0.45rem 0.65rem",
                            borderRadius: "6px",
                            background: isCorrectOpt
                              ? "var(--badge-success-bg)"
                              : isSelectedOpt
                              ? "var(--badge-danger-bg)"
                              : "var(--color-white)",
                            border: `1px solid ${
                              isCorrectOpt ? "#22c55e" : isSelectedOpt ? "#ef4444" : "var(--color-gray-200)"
                            }`,
                            fontWeight: isCorrectOpt || isSelectedOpt ? 700 : 500,
                            color: "var(--color-gray-900)",
                          }}
                        >
                          <strong style={{ textTransform: "uppercase" }}>{opt.key}.</strong> {opt.text}{" "}
                          {isCorrectOpt && <span style={{ color: "var(--badge-success-text)" }}>✓ (Answer)</span>}
                          {!isCorrectOpt && isSelectedOpt && (
                            <span style={{ color: "var(--badge-danger-text)" }}>✗ (Your Choice)</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {item.explanation && (
                    <div
                      style={{
                        marginTop: "0.65rem",
                        paddingTop: "0.55rem",
                        borderTop: "1px dashed var(--color-gray-300)",
                        fontSize: "0.82rem",
                        color: "var(--color-gray-800)",
                      }}
                    >
                      <strong>Explanation:</strong> {item.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Staff Supervisor Panel: Lift Day Locks & Inspect Integrity Signals */}
      {studentStatus?.isStaffSupervisor && integrityData && (
        <div
          style={{
            width: "100%",
            maxWidth: "900px",
            minWidth: 0,
            margin: "1.5rem auto 0 auto",
            background: "var(--color-white)",
            borderRadius: "12px",
            padding: "clamp(1rem, 3vw, 1.75rem)",
            border: "1px solid var(--color-gray-200)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <h2 style={{ color: "var(--color-navy-blue)", margin: "0 0 0.5rem 0", fontSize: "1.3rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiShield color="var(--color-primary-green)" /> Staff CBT Integrity &amp; Day-Lock Supervisor
          </h2>
          <p style={{ color: "var(--color-gray-500)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
            Teachers, Form Masters, and the Principal can review automatic 2-strike day locks and lift them with a mandatory audited reason.
          </p>

          <h4 style={{ color: "var(--color-gray-900)", marginBottom: "0.75rem" }}>
            Student Day Locks ({integrityData.activeLocks?.length || 0})
          </h4>
          {!integrityData.activeLocks || integrityData.activeLocks.length === 0 ? (
            <div style={{ padding: "1rem", background: "var(--surface-subtle)", borderRadius: "8px", color: "var(--color-gray-500)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
              No students are currently day-locked.
            </div>
          ) : (
            <div className="table-scroll" style={{ marginBottom: "1.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem", minWidth: "560px" }}>
                <thead>
                  <tr style={{ background: "var(--color-gray-100)", borderBottom: "2px solid var(--color-gray-300)", color: "var(--color-gray-900)" }}>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Student</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Lagos Day</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Violation Reason</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Status</th>
                    <th style={{ padding: "0.75rem", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {integrityData.activeLocks.map((lk: any) => (
                    <tr key={lk.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                      <td style={{ padding: "0.75rem", fontWeight: 600, color: "var(--color-gray-900)" }}>
                        {lk.student?.PreferredName || lk.student?.AdmissionNo} ({lk.student?.AdmissionNo})
                      </td>
                      <td style={{ padding: "0.75rem", fontFamily: "monospace", color: "var(--color-gray-600)" }}>{lk.dayKey}</td>
                      <td style={{ padding: "0.75rem", color: "var(--badge-danger-text)" }}>{lk.reason}</td>
                      <td style={{ padding: "0.75rem" }}>
                        {lk.liftedAt ? (
                          <span style={{ color: "var(--badge-success-text)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                            <FiCheckCircle /> Lifted ({lk.liftReason})
                          </span>
                        ) : (
                          <span style={{ color: "var(--badge-danger-text)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
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
