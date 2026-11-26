"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getStudentScheduledExams,
  startStrictExamAttempt,
} from "@/app/actions/cbtExams";
import {
  FiShield,
  FiLock,
  FiPlay,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiArrowRight,
  FiKey,
} from "react-icons/fi";

export default function StudentScheduledExamsPanel({
  isDayLocked,
  activeAttemptId,
}: {
  isDayLocked: boolean;
  activeAttemptId?: string | null;
}) {
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [acceptedMap, setAcceptedMap] = useState<Record<string, boolean>>({});
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getStudentScheduledExams();
      if (!cancelled && res.success) {
        setExams(res.exams || []);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || exams.length === 0) return null;

  const handleLaunchExam = async (ex: any) => {
    setErrMsg("");
    if (ex.myAttempt?.status === "ACTIVE") {
      router.push(`/portal/cbt/quiz?attemptId=${encodeURIComponent(ex.myAttempt.id)}`);
      return;
    }

    if (!ex.feeEligible && ex.requireFeeClearance) {
      setErrMsg(
        `Fee Clearance Pending for "${ex.title}". Clear this term's fees with the Bursar before entering the Examination Room.`
      );
      return;
    }

    if (!acceptedMap[ex.id]) {
      setErrMsg(`Acknowledge Exam Strict Mode rules for "${ex.title}" before launching.`);
      return;
    }
    if (ex.requireAccessCode && !(pins[ex.id] || "").trim()) {
      setErrMsg(`Enter the Invigilator Exam PIN for "${ex.title}".`);
      return;
    }

    setLaunchingId(ex.id);
    // Request fullscreen cleanly during the click gesture where supported
    if (ex.strictMode && typeof document !== "undefined") {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    const res = await startStrictExamAttempt({
      scheduledExamId: ex.id,
      accessCode: pins[ex.id] || undefined,
    });

    if (res.success && res.attemptId) {
      if (res.sessionToken && typeof window !== "undefined") {
        window.sessionStorage.setItem(`wofs_cbt_tok_${res.attemptId}`, res.sessionToken);
      }
      router.push(`/portal/cbt/quiz?attemptId=${encodeURIComponent(res.attemptId)}`);
      return;
    }

    setErrMsg(res.error || "Unable to launch official exam.");
    setLaunchingId(null);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "900px",
        margin: "0 auto",
        background: "var(--color-white)",
        border: "2px solid var(--color-navy-blue)",
        borderRadius: "14px",
        padding: "clamp(1rem, 3vw, 1.5rem)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, color: "var(--color-navy-blue)", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiShield color="var(--color-primary-green)" /> Official Class CBT Examinations (Exam Strict Mode)
          </h2>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.84rem", color: "var(--color-gray-600)" }}>
            Scheduled tests and term examinations assigned to your class by your teachers &amp; administration.
          </p>
        </div>
        <Link
          href="/portal/exam-room"
          className="btn btn-primary"
          style={{
            fontSize: "0.82rem",
            padding: "0.45rem 0.9rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            textDecoration: "none",
          }}
        >
          <FiKey /> Open Subject Examination Room <FiArrowRight />
        </Link>
      </div>

      {errMsg && (
        <div
          style={{
            background: "var(--badge-danger-bg)",
            color: "var(--badge-danger-text)",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            marginBottom: "1rem",
            fontSize: "0.86rem",
            fontWeight: 700,
          }}
        >
          {errMsg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {exams.map((ex) => {
          const att = ex.myAttempt;
          const isLive = ex.status === "LIVE" && ex.windowEligible;
          const canResumeActive = att?.status === "ACTIVE";
          const alreadyDone =
            att && (att.status === "SUBMITTED" || att.status === "EXPIRED" || att.status === "TERMINATED");

          return (
            <div
              key={ex.id}
              style={{
                border: `1px solid ${isLive ? "var(--color-primary-green)" : "var(--color-gray-200)"}`,
                background: isLive ? "var(--surface-subtle)" : "var(--color-gray-50)",
                borderRadius: "12px",
                padding: "1.1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.65rem" }}>
                <div>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span
                      style={{
                        padding: "0.18rem 0.6rem",
                        borderRadius: "999px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        background: isLive ? "var(--badge-success-bg)" : ex.status === "CLOSED" ? "var(--color-gray-200)" : "var(--badge-info-bg)",
                        color: isLive ? "var(--badge-success-text)" : ex.status === "CLOSED" ? "var(--color-gray-700)" : "var(--badge-info-text)",
                      }}
                    >
                      {isLive ? "LIVE EXAM OPEN" : ex.status}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                      {ex.subjectName} · {ex.examType.replace(/_/g, " ")}
                    </span>
                    {ex.strictMode && (
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--badge-danger-text)", background: "var(--badge-danger-bg)", padding: "0.15rem 0.5rem", borderRadius: "999px" }}>
                        {ex.maxStrikes}-Strike Strict Lock
                      </span>
                    )}
                    {!ex.feeEligible && ex.requireFeeClearance && (
                      <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--badge-danger-text)", background: "var(--badge-danger-bg)", padding: "0.15rem 0.5rem", borderRadius: "999px" }}>
                        Fee Clearance Required
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, color: "var(--color-gray-900)", fontSize: "1.05rem" }}>{ex.title}</h3>
                </div>

                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--color-gray-700)" }}>
                  <FiClock style={{ verticalAlign: "middle" }} /> {ex.questionCount} Qs · {ex.durationMinutes} mins
                </div>
              </div>

              {alreadyDone ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", padding: "0.65rem 0.85rem", borderRadius: "8px", background: "var(--color-white)", border: "1px solid var(--color-gray-200)" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", color: att.status === "TERMINATED" ? "var(--badge-danger-text)" : "var(--badge-success-text)" }}>
                    {att.status === "TERMINATED" ? <FiAlertTriangle /> : <FiCheckCircle />}
                    Status: {att.status}
                  </div>
                  <div style={{ fontSize: "0.84rem", fontWeight: 800, color: "var(--color-navy-blue)" }}>
                    {att.status === "TERMINATED"
                      ? "See Examiner / Principal"
                      : att.scoreWithheld
                      ? "Score Held Until Examiner Release"
                      : `Score: ${att.scorePct}%`}
                  </div>
                </div>
              ) : canResumeActive || isLive ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {!canResumeActive && !ex.feeEligible && ex.requireFeeClearance && (
                    <div
                      style={{
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        background: "var(--badge-danger-bg)",
                        color: "var(--badge-danger-text)",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      Term Fee Clearance Pending: Clear this term&apos;s tuition/fees with the Bursar or Administration to unlock this Examination Room.
                    </div>
                  )}

                  {!canResumeActive && ex.requireAccessCode && ex.feeEligible && (
                    <div>
                      <input
                        type="text"
                        placeholder="Enter Subject Examination Room Code / Invigilator PIN..."
                        value={pins[ex.id] || ""}
                        onChange={(e) => setPins((prev) => ({ ...prev, [ex.id]: e.target.value }))}
                        style={{
                          width: "100%",
                          maxWidth: "360px",
                          padding: "0.55rem 0.75rem",
                          borderRadius: "8px",
                          border: "1px solid var(--color-gray-300)",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      />
                    </div>
                  )}

                  {!canResumeActive && (
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", color: "var(--color-gray-800)" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(acceptedMap[ex.id])}
                        onChange={(e) =>
                          setAcceptedMap((prev) => ({ ...prev, [ex.id]: e.target.checked }))
                        }
                        style={{ marginTop: "0.18rem" }}
                      />
                      <span>
                        I confirm I am ready in Exam Strict Mode (fullscreen required, no tab switching, copy/paste blocked; {ex.maxStrikes} strike{ex.maxStrikes === 1 ? "" : "s"} will lock my exam).
                      </span>
                    </label>
                  )}

                  <div>
                    <button
                      type="button"
                      disabled={isDayLocked || launchingId === ex.id || (!canResumeActive && ex.requireFeeClearance && !ex.feeEligible)}
                      onClick={() => handleLaunchExam(ex)}
                      className="btn btn-primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                    >
                      {isDayLocked || (!canResumeActive && ex.requireFeeClearance && !ex.feeEligible) ? <FiLock /> : <FiPlay />}
                      {isDayLocked
                        ? "CBT Locked Today"
                        : !canResumeActive && ex.requireFeeClearance && !ex.feeEligible
                        ? "Fee Clearance Required"
                        : launchingId === ex.id
                        ? "Launching Protected Exam Hall..."
                        : canResumeActive
                        ? "Resume Active Official Exam"
                        : "Enter Examination Room (Strict Mode)"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.82rem", color: "var(--color-gray-600)", fontWeight: 600 }}>
                  {ex.windowReason || "Waiting for Examiner to open this examination."}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
