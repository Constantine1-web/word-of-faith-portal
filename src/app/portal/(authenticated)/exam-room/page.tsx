"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getStudentScheduledExams,
  startStrictExamAttempt,
} from "@/app/actions/cbtExams";
import { formatCbtSubjectLabel } from "@/lib/cbt-constants";
import {
  FiShield,
  FiLock,
  FiPlay,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiKey,
  FiRefreshCw,
  FiArrowLeft,
  FiBookOpen,
} from "react-icons/fi";

export default function StudentExaminationRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState<{
    studentId: number;
    admissionNo: string;
    name: string;
    className: string;
    isFeeCleared: boolean;
    enrolmentStatus: string;
  } | null>(null);
  const [termLabel, setTermLabel] = useState("");
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [roomCode, setRoomCode] = useState<string>("");
  const [acceptedRules, setAcceptedRules] = useState<boolean>(false);
  const [launching, setLaunching] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const fetchRooms = useCallback(async () => {
    const res = await getStudentScheduledExams();
    return res;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchRooms();
      if (cancelled) return;
      if (res.success) {
        setStudentInfo(res.studentInfo || null);
        setTermLabel(res.termLabel || "");
        const list = res.exams || [];
        setExams(list);
        const firstLive = list.find(
          (e: any) => e.status === "LIVE" && (!e.myAttempt || e.myAttempt.status === "ACTIVE")
        );
        if (firstLive) {
          setSelectedExamId(firstLive.id);
        } else if (list.length > 0) {
          setSelectedExamId(list[0].id);
        }
      } else if (res.error) {
        setErrorMsg(res.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRooms]);

  const handleRefresh = async () => {
    setLoading(true);
    setErrorMsg("");
    const res = await fetchRooms();
    if (res.success) {
      setStudentInfo(res.studentInfo || null);
      setTermLabel(res.termLabel || "");
      setExams(res.exams || []);
    } else if (res.error) {
      setErrorMsg(res.error);
    }
    setLoading(false);
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId) || null;

  const handleEnterRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    setErrorMsg("");

    if (selectedExam.myAttempt?.status === "ACTIVE") {
      router.push(`/portal/cbt/quiz?attemptId=${encodeURIComponent(selectedExam.myAttempt.id)}`);
      return;
    }

    if (!selectedExam.feeEligible) {
      setErrorMsg(
        "Term Fee Clearance Required: Please clear your school fees for the term or visit the Bursar before entering this Examination Room."
      );
      return;
    }

    if (selectedExam.requireAccessCode && !roomCode.trim()) {
      setErrorMsg(
        `Please enter the Morning Examination Room Code for ${selectedExam.subjectName}.`
      );
      return;
    }

    if (!acceptedRules) {
      setErrorMsg("Please read and accept the Examination Room Strict Mode rules before entering.");
      return;
    }

    setLaunching(true);
    if (selectedExam.strictMode && typeof document !== "undefined") {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    const res = await startStrictExamAttempt({
      scheduledExamId: selectedExam.id,
      accessCode: roomCode.trim() || undefined,
    });

    if (res.success && res.attemptId) {
      if (res.sessionToken && typeof window !== "undefined") {
        window.sessionStorage.setItem(`wofs_cbt_tok_${res.attemptId}`, res.sessionToken);
      }
      router.push(`/portal/cbt/quiz?attemptId=${encodeURIComponent(res.attemptId)}`);
      return;
    }

    setErrorMsg(res.error || "Unable to enter Examination Room.");
    setLaunching(false);
  };

  return (
    <div style={{ maxWidth: "1020px", margin: "0 auto", padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      {/* Top Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A2540, #1E3A8A)",
          borderRadius: "16px",
          padding: "clamp(1.25rem, 3vw, 2rem)",
          color: "#FFFFFF",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#4ade80", marginBottom: "0.35rem" }}>
            <FiShield /> Word of Faith Schools · Official Virtual Examination Hall
          </div>
          <h1 style={{ margin: "0 0 0.35rem 0", fontSize: "clamp(1.35rem, 4vw, 1.9rem)", color: "#FFFFFF" }}>
            Subject Examination Rooms
          </h1>
          <p style={{ margin: 0, fontSize: "0.92rem", color: "rgba(255,255,255,0.86)" }}>
            Select your scheduled subject room, enter the Exam Officer&apos;s morning room code, and complete your examination under Strict Mode.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", alignItems: "flex-end" }}>
          {studentInfo && (
            <div style={{ background: "rgba(255,255,255,0.12)", padding: "0.75rem 1.1rem", borderRadius: "10px", fontSize: "0.84rem" }}>
              <div style={{ fontWeight: 800, color: "#FFFFFF" }}>
                {studentInfo.name} ({studentInfo.admissionNo})
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)" }}>
                Class: <strong>{studentInfo.className}</strong> {termLabel ? `· ${termLabel}` : ""}
              </div>
              <div style={{ marginTop: "0.25rem", fontWeight: 700, color: studentInfo.isFeeCleared ? "#4ade80" : "#fde047" }}>
                {studentInfo.isFeeCleared
                  ? "✓ Term Fee Clearance Verified"
                  : "⚠ Term Fee Balance Pending"}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              href="/portal/dashboard"
              className="btn btn-outline"
              style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.35)", fontSize: "0.8rem", padding: "0.35rem 0.75rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              <FiArrowLeft /> Dashboard
            </Link>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="btn btn-outline"
              style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.35)", fontSize: "0.8rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              <FiRefreshCw /> Refresh Rooms
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
            border: "1px solid var(--status-error-border)",
            padding: "0.95rem 1.15rem",
            borderRadius: "10px",
            marginBottom: "1.25rem",
            fontWeight: 700,
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FiAlertTriangle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "14px", padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
          Loading your class examination schedule &amp; subject rooms...
        </div>
      ) : exams.length === 0 ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "14px", padding: "3rem 1.5rem", textAlign: "center" }}>
          <FiBookOpen size={42} color="var(--color-navy-blue)" style={{ marginBottom: "0.75rem" }} />
          <h3 style={{ margin: "0 0 0.4rem 0", color: "var(--color-navy-blue)" }}>
            No Official Subject Examination Rooms Scheduled Yet
          </h3>
          <p style={{ margin: "0 0 1.25rem 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            When the Examination Officer schedules or activates an official test or terminal examination for {studentInfo?.className || "your class"}, its virtual room will appear here automatically.
          </p>
          <Link href="/portal/cbt" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Open Self-Paced CBT Practice Studio
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          {/* Left Column: Subject Rooms Directory */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              borderRadius: "14px",
              padding: "1.25rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h2 style={{ margin: "0 0 0.85rem 0", fontSize: "1.05rem", color: "var(--color-navy-blue)" }}>
              1. Select Your Subject Examination Room ({exams.length})
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {exams.map((ex) => {
                const isSelected = ex.id === selectedExamId;
                const isLive = ex.status === "LIVE" && ex.windowEligible;
                const att = ex.myAttempt;

                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => {
                      setSelectedExamId(ex.id);
                      setErrorMsg("");
                      setAcceptedRules(false);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "1rem",
                      borderRadius: "12px",
                      border: `2px solid ${
                        isSelected
                          ? "var(--color-primary-green)"
                          : isLive
                          ? "var(--status-info-border)"
                          : "var(--border-primary)"
                      }`,
                      background: isSelected ? "var(--bg-secondary)" : "var(--bg-card)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                      <span
                        style={{
                          padding: "0.18rem 0.55rem",
                          borderRadius: "999px",
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          background: isLive
                            ? "var(--status-success-bg)"
                            : ex.status === "CLOSED"
                            ? "var(--color-gray-200)"
                            : "var(--status-info-bg)",
                          color: isLive
                            ? "var(--status-success-text)"
                            : ex.status === "CLOSED"
                            ? "var(--color-gray-700)"
                            : "var(--status-info-text)",
                        }}
                      >
                        {isLive ? "ROOM OPEN · LIVE" : ex.status}
                      </span>

                      <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-muted)" }}>
                        <FiClock style={{ verticalAlign: "middle" }} /> {ex.questionCount} Qs · {ex.durationMinutes} mins
                      </span>
                    </div>

                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-heading)" }}>
                      {ex.subjectName || formatCbtSubjectLabel(ex.subjectCode)}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                      {ex.title} · ({ex.examType.replace(/_/g, " ")})
                    </div>

                    {att && (
                      <div style={{ marginTop: "0.5rem", fontSize: "0.78rem", fontWeight: 700, color: att.status === "TERMINATED" ? "var(--status-error-text)" : "var(--status-success-text)" }}>
                        Attempt Status: {att.status}
                        {att.status === "SUBMITTED" && !att.scoreWithheld && att.scorePct !== null
                          ? ` · Score: ${att.scorePct}%`
                          : att.status === "SUBMITTED"
                          ? " · Score Sealed Until Release"
                          : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Room Verification & Code Gate */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              borderRadius: "14px",
              padding: "1.4rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {!selectedExam ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                Select a subject examination room on the left to continue.
              </div>
            ) : (
              <form onSubmit={handleEnterRoom} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--color-primary-green)", textTransform: "uppercase" }}>
                    2. Subject Room Verification Gate
                  </span>
                  <h2 style={{ margin: "0.2rem 0", fontSize: "1.2rem", color: "var(--color-navy-blue)" }}>
                    {selectedExam.subjectName} — {selectedExam.title}
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-muted)" }}>
                    {selectedExam.questionCount} Objective Questions · {selectedExam.durationMinutes} Minutes Allocated ·{" "}
                    {selectedExam.strictMode
                      ? `${selectedExam.maxStrikes}-Strike Fullscreen Proctoring`
                      : "Standard Timed Mode"}
                  </p>
                </div>

                {/* Eligibility Checklist Box */}
                <div
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "10px",
                    padding: "0.9rem 1rem",
                    fontSize: "0.83rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Class &amp; Subject Registration:</span>
                    <strong style={{ color: "var(--status-success-text)" }}>
                      ✓ Verified ({studentInfo?.className})
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Term Fee Clearance Requirement:</span>
                    <strong
                      style={{
                        color: selectedExam.feeEligible
                          ? "var(--status-success-text)"
                          : "var(--status-error-text)",
                      }}
                    >
                      {selectedExam.feeEligible
                        ? "✓ Cleared to Write"
                        : "✗ Fee Clearance Required"}
                    </strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Room Window Status:</span>
                    <strong
                      style={{
                        color:
                          selectedExam.status === "LIVE" && selectedExam.windowEligible
                            ? "var(--status-success-text)"
                            : "var(--status-warning-text)",
                      }}
                    >
                      {selectedExam.status === "LIVE" && selectedExam.windowEligible
                        ? "✓ Open for Entry"
                        : selectedExam.windowReason || selectedExam.status}
                    </strong>
                  </div>
                </div>

                {selectedExam.myAttempt &&
                (selectedExam.myAttempt.status === "SUBMITTED" ||
                  selectedExam.myAttempt.status === "EXPIRED" ||
                  selectedExam.myAttempt.status === "TERMINATED") ? (
                  <div
                    style={{
                      padding: "1.1rem",
                      borderRadius: "10px",
                      background:
                        selectedExam.myAttempt.status === "TERMINATED"
                          ? "var(--status-error-bg)"
                          : "var(--status-success-bg)",
                      color:
                        selectedExam.myAttempt.status === "TERMINATED"
                          ? "var(--status-error-text)"
                          : "var(--status-success-text)",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                    }}
                  >
                    {selectedExam.myAttempt.status === "TERMINATED" ? (
                      <>
                        <FiAlertTriangle style={{ marginRight: "0.4rem", verticalAlign: "middle" }} />
                        Your attempt in this examination room was terminated due to integrity strikes. Please see the Examination Officer if a technical malfunction occurred.
                      </>
                    ) : (
                      <>
                        <FiCheckCircle style={{ marginRight: "0.4rem", verticalAlign: "middle" }} />
                        You have completed and submitted this examination.{" "}
                        {selectedExam.myAttempt.scoreWithheld
                          ? "Your official score is sealed until the Exam Officer releases results."
                          : `Official Score: ${selectedExam.myAttempt.scorePct}%`}
                      </>
                    )}
                  </div>
                ) : selectedExam.myAttempt?.status === "ACTIVE" ? (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ justifyContent: "center", padding: "0.85rem", fontSize: "0.95rem" }}
                  >
                    <FiPlay style={{ marginRight: "0.4rem" }} /> Resume Your Active Examination Now
                  </button>
                ) : (
                  <>
                    {selectedExam.requireAccessCode && (
                      <div>
                        <label
                          className="form-label"
                          style={{ fontSize: "0.85rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <FiKey color="var(--color-primary-green)" /> Enter Morning Examination Room Code *
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={roomCode}
                          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                          placeholder="e.g., MTH-7K4P-WOF"
                          autoComplete="off"
                          style={{
                            fontFamily: "monospace",
                            fontSize: "1.05rem",
                            fontWeight: 800,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                          required
                        />
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                          Enter the subject-specific room code announced by your Hall Invigilator or Exam Officer. (Rate-limited against guessing).
                        </div>
                      </div>
                    )}

                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.6rem",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-primary)",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={acceptedRules}
                        onChange={(e) => setAcceptedRules(e.target.checked)}
                        style={{ marginTop: "0.2rem" }}
                      />
                      <span>
                        I confirm that I am registered for <strong>{selectedExam.subjectName}</strong>, my device is ready for Fullscreen Exam Strict Mode, and I understand that leaving fullscreen, switching tabs, or copying questions will trigger a strike ({selectedExam.maxStrikes}-strike lockout).
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={
                        launching ||
                        !selectedExam.feeEligible ||
                        selectedExam.status !== "LIVE" ||
                        !selectedExam.windowEligible
                      }
                      className="btn btn-primary"
                      style={{ justifyContent: "center", padding: "0.85rem", fontSize: "0.95rem" }}
                    >
                      {!selectedExam.feeEligible ? (
                        <>
                          <FiLock style={{ marginRight: "0.4rem" }} /> Fee Clearance Required
                        </>
                      ) : selectedExam.status !== "LIVE" || !selectedExam.windowEligible ? (
                        <>
                          <FiLock style={{ marginRight: "0.4rem" }} /> Room Not Yet Open
                        </>
                      ) : launching ? (
                        "Verifying Eligibility & Room Code..."
                      ) : (
                        <>
                          <FiPlay style={{ marginRight: "0.4rem" }} /> Validate Code &amp; Enter Examination Room
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
