"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./QuizClient.module.css";
import Link from "next/link";
import {
  getQuestion,
  saveAnswer,
  reportIntegrityEvent,
  sendAttemptHeartbeat,
  submitAttempt,
  getAttemptAiAnalysis,
  getQuestionAiExplanation,
} from "@/app/actions/cbt";
import {
  FiClock,
  FiCheckCircle,
  FiArrowRight,
  FiArrowLeft,
  FiGrid,
  FiAlertTriangle,
  FiLock,
  FiShield,
  FiMaximize,
  FiCpu,
  FiBookOpen,
} from "react-icons/fi";

interface QuizClientProps {
  attemptId: string;
}

/**
 * Strips raw HTML tags while decoding common HTML entities so question stems render
 * safely as plain text without dangerouslySetInnerHTML (Nov 1 Blueprint Section 6.9).
 */
function cleanHtmlText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<sub[^>]*>(.*?)<\/sub>/gi, "_($1)")
    .replace(/<sup[^>]*>(.*?)<\/sup>/gi, "^($1)")
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "[$1]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export default function QuizClient({ attemptId }: QuizClientProps) {
  const [position, setPosition] = useState(1);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [attemptMeta, setAttemptMeta] = useState<{
    id: string;
    subjectCode: string;
    examBody: string;
    mode: string;
    questionCount: number;
    expiresAt: string;
    hardStrikes: number;
    maxStrikes: number;
    answeredMap: Record<number, boolean>;
  } | null>(null);
  const [watermark, setWatermark] = useState<{
    studentName: string;
    admissionNo: string;
    attemptId: string;
    timestamp: string;
  } | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<{
    position: number;
    stem: string;
    imageUrl: string | null;
    examBody: string;
    examYear: number | null;
    options: { key: string; text: string }[];
    selectedKey: string | null;
  } | null>(null);

  const [timeLeft, setTimeLeft] = useState<number>(600);
  const [warningModal, setWarningModal] = useState<{
    message: string;
    countdown: number;
  } | null>(null);
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    summary: any;
    reviewItems: any[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gemini AI CBT Review & Step-by-Step Solutions
  const [aiAnalysis, setAiAnalysis] = useState<{
    overallFeedback: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  } | null>(null);
  const [loadingAiAnalysis, setLoadingAiAnalysis] = useState<boolean>(false);
  const [aiExplanations, setAiExplanations] = useState<Record<number, string>>({});
  const [loadingExplanationFor, setLoadingExplanationFor] = useState<number | null>(null);

  const handleFetchAiAnalysis = async () => {
    if (!attemptId || loadingAiAnalysis) return;
    setLoadingAiAnalysis(true);
    try {
      const res = await getAttemptAiAnalysis(attemptId);
      if (res.success && res.analysis) {
        setAiAnalysis(res.analysis);
      }
    } catch (e) {
      console.error("AI Analysis error:", e);
    } finally {
      setLoadingAiAnalysis(false);
    }
  };

  const handleExplainQuestion = async (item: any) => {
    if (loadingExplanationFor !== null) return;
    setLoadingExplanationFor(item.position);
    try {
      const res = await getQuestionAiExplanation({
        stem: item.stem,
        options: item.options,
        correctKey: item.correctKey,
        selectedKey: item.selectedKey,
        subjectCode: submittedResult?.summary?.subjectCode || "general",
        examBody: submittedResult?.summary?.examBody || "WASSCE",
      });
      if (res.success && res.explanation) {
        setAiExplanations((prev) => ({ ...prev, [item.position]: res.explanation! }));
      }
    } catch (e) {
      console.error("Explain question error:", e);
    } finally {
      setLoadingExplanationFor(null);
    }
  };

  const questionLoadedAtRef = useRef<number>(Date.now());
  const blurStartedAtRef = useRef<number | null>(null);

  // Fetch ONLY the single active question slot from the server
  const loadQuestionSlot = useCallback(
    async (targetPos: number) => {
      setLoadingQuestion(true);
      setErrorMsg(null);
      const res = await getQuestion(attemptId, targetPos);
      if (res.success && res.question && res.attempt) {
        setAttemptMeta(res.attempt);
        setWatermark(res.watermark || null);
        setCurrentQuestion(res.question);
        setPosition(res.question.position);
        questionLoadedAtRef.current = Date.now();

        const remainingSec = Math.max(
          0,
          Math.floor((new Date(res.attempt.expiresAt).getTime() - Date.now()) / 1000)
        );
        setTimeLeft(remainingSec);
      } else if (res.terminated || res.dayLocked) {
        setTerminatedReason(res.error || "Attempt terminated due to exam integrity violation.");
      } else if (res.submitted || res.expired) {
        const finalRes = await submitAttempt(attemptId);
        if (finalRes.success && finalRes.summary) {
          setSubmittedResult({
            summary: finalRes.summary,
            reviewItems: finalRes.reviewItems || [],
          });
        }
      } else {
        setErrorMsg(res.error || "Unable to load question.");
      }
      setLoadingQuestion(false);
    },
    [attemptId]
  );

  useEffect(() => {
    loadQuestionSlot(1);
  }, [loadQuestionSlot]);

  // Server-authoritative countdown timer
  useEffect(() => {
    if (submittedResult || terminatedReason || !attemptMeta) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(attemptMeta.expiresAt).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleFinalSubmit();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [attemptMeta, submittedResult, terminatedReason]);

  // 15-second Server Heartbeat (Section 7.3)
  useEffect(() => {
    if (submittedResult || terminatedReason) return;

    const hb = setInterval(async () => {
      const res = await sendAttemptHeartbeat(attemptId);
      if (res.status === "EXPIRED") {
        handleFinalSubmit();
      } else if (res.status === "TERMINATED") {
        setTerminatedReason("Attempt terminated by server integrity monitor.");
      }
    }, 15000);

    return () => clearInterval(hb);
  }, [attemptId, submittedResult, terminatedReason]);

  // 10-second Strike 1 Warning Modal Countdown
  useEffect(() => {
    if (!warningModal) return;
    if (warningModal.countdown <= 0) {
      setWarningModal(null);
      return;
    }
    const t = setTimeout(() => {
      setWarningModal((prev) => (prev ? { ...prev, countdown: prev.countdown - 1 } : null));
    }, 1000);
    return () => clearTimeout(t);
  }, [warningModal]);

  // Page Visibility, Window Blur, Fullscreen & Copy/Paste Integrity Listeners (Section 7.2 & 7.3)
  useEffect(() => {
    if (submittedResult || terminatedReason) return;

    const handleHardViolation = async (
      type: "TAB_HIDDEN" | "WINDOW_BLUR" | "FULLSCREEN_EXIT",
      durationMs: number
    ) => {
      const res = await reportIntegrityEvent({
        attemptId,
        type,
        durationMs,
      });

      if (res.status === "TERMINATED") {
        setWarningModal(null);
        setTerminatedReason(
          res.message ||
            "Strike 2 reached: Your CBT attempt has been terminated and your account is locked for today."
        );
      } else if (res.status === "WARNING") {
        setAttemptMeta((prev) =>
          prev ? { ...prev, hardStrikes: res.hardStrikes ?? prev.hardStrikes + 1 } : prev
        );
        setWarningModal({
          message:
            res.message ||
            "STRIKE 1 OF 2: Focus loss detected. Return immediately or your exam will be terminated.",
          countdown: 10,
        });
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        blurStartedAtRef.current = Date.now();
      } else if (blurStartedAtRef.current) {
        const elapsed = Date.now() - blurStartedAtRef.current;
        blurStartedAtRef.current = null;
        if (elapsed >= 3000) {
          handleHardViolation("TAB_HIDDEN", elapsed);
        }
      }
    };

    const onWindowBlur = () => {
      if (!blurStartedAtRef.current) {
        blurStartedAtRef.current = Date.now();
      }
    };

    const onWindowFocus = () => {
      if (blurStartedAtRef.current) {
        const elapsed = Date.now() - blurStartedAtRef.current;
        blurStartedAtRef.current = null;
        if (elapsed >= 3000) {
          handleHardViolation("WINDOW_BLUR", elapsed);
        }
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && attemptMeta?.mode === "MOCK") {
        handleHardViolation("FULLSCREEN_EXIT", 4000);
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportIntegrityEvent({ attemptId, type: "COPY_ATTEMPT" });
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportIntegrityEvent({ attemptId, type: "PASTE_ATTEMPT" });
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportIntegrityEvent({ attemptId, type: "CONTEXT_MENU" });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [attemptId, attemptMeta?.mode, submittedResult, terminatedReason]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectOption = async (optionKey: string) => {
    if (!currentQuestion || !attemptMeta || submittedResult || terminatedReason) return;

    const spentMs = Date.now() - questionLoadedAtRef.current;
    setCurrentQuestion((prev) => (prev ? { ...prev, selectedKey: optionKey } : prev));
    setAttemptMeta((prev) =>
      prev
        ? {
            ...prev,
            answeredMap: { ...prev.answeredMap, [currentQuestion.position]: true },
          }
        : prev
    );

    const res = await saveAnswer({
      attemptId,
      position: currentQuestion.position,
      selectedKey: optionKey,
      timeSpentMs: spentMs,
    });

    if (res.dayLocked) {
      setTerminatedReason(res.error || "CBT access locked for today.");
    } else if (res.expired) {
      handleFinalSubmit();
    }
  };

  const handleFinalSubmit = async () => {
    setLoadingQuestion(true);
    const res = await submitAttempt(attemptId);
    if (res.success && res.summary) {
      setSubmittedResult({
        summary: res.summary,
        reviewItems: res.reviewItems || [],
      });
    } else if (res.terminated) {
      setTerminatedReason(res.error || "Attempt was terminated.");
    } else {
      setErrorMsg(res.error || "Failed to submit exam.");
    }
    setLoadingQuestion(false);
  };

  // 1. Terminated & Day-Locked View
  if (terminatedReason) {
    return (
      <div style={{ maxWidth: "640px", margin: "3rem auto", background: "#fef2f2", border: "2px solid #ef4444", borderRadius: "16px", padding: "2.5rem", textAlign: "center" }}>
        <FiLock size={48} color="#dc2626" style={{ marginBottom: "1rem" }} />
        <h2 style={{ color: "#991b1b", marginBottom: "0.75rem" }}>
          CBT Attempt Terminated & Day-Lock Active
        </h2>
        <p style={{ color: "#7f1d1d", fontSize: "0.96rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {terminatedReason}
        </p>
        <div style={{ background: "white", padding: "1rem", borderRadius: "8px", fontSize: "0.85rem", color: "#475569", marginBottom: "1.5rem" }}>
          Your attempt and integrity telemetry have been logged in the school&apos;s append-only AuditLog. Please contact your Subject Teacher or the Principal if this was caused by a power or device interruption.
        </div>
        <Link href="/portal/cbt" className="btn btn-primary" style={{ textDecoration: "none" }}>
          Return to CBT Portal
        </Link>
      </div>
    );
  }

  // 2. Post-Submission Graded Review View (Answer Keys joined server-side ONLY after submit)
  if (submittedResult) {
    const { summary, reviewItems } = submittedResult;
    return (
      <div className={styles.resultsContainer}>
        <div className={styles.scoreCard}>
          <h2>Exam Submitted & Graded Server-Side</h2>
          <div className={styles.scoreCircle}>
            <span>{summary.percentage}%</span>
          </div>
          <p>
            You scored <strong>{summary.correctCount}</strong> out of{" "}
            <strong>{summary.questionCount}</strong> ({summary.subjectCode.toUpperCase()} ·{" "}
            {summary.examBody})
          </p>
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Integrity Strikes Recorded: {summary.hardStrikes} / 2
          </p>
          <div className={styles.resultActions}>
            <Link href="/portal/cbt" className={styles.dashboardBtn}>
              Start New CBT Session
            </Link>
          </div>

          {/* Faithbot Gemini AI Performance Review Card */}
          <div className={styles.aiTutorCard}>
            <div className={styles.aiTutorHeader}>
              <FiCpu className={styles.aiIcon} />
              <div>
                <h4>Faithbot AI Academic Diagnosis</h4>
                <p>Curriculum-aligned performance review powered by Google Gemini</p>
              </div>
            </div>

            {!aiAnalysis ? (
              <button
                type="button"
                className={styles.aiTutorBtn}
                onClick={handleFetchAiAnalysis}
                disabled={loadingAiAnalysis}
              >
                <FiCpu /> {loadingAiAnalysis ? "Analyzing Your Attempt with Gemini..." : "Generate AI Exam Performance Breakdown"}
              </button>
            ) : (
              <div className={styles.aiAnalysisContent}>
                <p className={styles.aiFeedback}>{aiAnalysis.overallFeedback}</p>
                {aiAnalysis.strengths.length > 0 && (
                  <div className={styles.aiSection}>
                    <strong style={{ color: "#10b981" }}>Key Strengths:</strong>
                    <ul>
                      {aiAnalysis.strengths.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiAnalysis.weaknesses.length > 0 && (
                  <div className={styles.aiSection}>
                    <strong style={{ color: "#ef4444" }}>Areas for Revision:</strong>
                    <ul>
                      {aiAnalysis.weaknesses.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiAnalysis.recommendations.length > 0 && (
                  <div className={styles.aiSection}>
                    <strong style={{ color: "#3b82f6" }}>Examiner Recommendations:</strong>
                    <ul>
                      {aiAnalysis.recommendations.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={styles.correctionsWrapper}>
          <h3>Attempt Review & Step-by-Step Explanations</h3>
          {reviewItems.map((item: any) => {
            const isCorrect = item.isCorrect;
            return (
              <div
                key={item.position}
                className={`${styles.correctionItem} ${isCorrect ? styles.correct : styles.wrong}`}
              >
                <div className={styles.questionText}>
                  <strong>{item.position}.</strong> <span>{cleanHtmlText(item.stem)}</span>
                </div>
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="Question figure" className={styles.qImage} />
                )}

                <div className={styles.optionsList}>
                  {item.options.map((opt: { key: string; text: string }) => {
                    const isSelected = item.selectedKey === opt.key;
                    const isActualAnswer = item.correctKey === opt.key;

                    let itemClass = styles.optionItem;
                    if (isActualAnswer) itemClass += ` ${styles.optionActual}`;
                    else if (isSelected && !isCorrect) itemClass += ` ${styles.optionWrong}`;

                    return (
                      <div key={opt.key} className={itemClass}>
                        <span className={styles.optionLetter}>{opt.key.toUpperCase()}</span>
                        <span>{cleanHtmlText(opt.text)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Official Solution */}
                {item.explanation && (
                  <div className={styles.solutionBox}>
                    <strong>Official Solution:</strong>
                    <div>{cleanHtmlText(item.explanation)}</div>
                  </div>
                )}

                {/* Gemini AI Detailed Step-by-Step Explanation */}
                {aiExplanations[item.position] ? (
                  <div className={styles.aiSolutionBox}>
                    <strong>Faithbot AI Step-by-Step Solution:</strong>
                    <div style={{ whiteSpace: "pre-line", marginTop: "0.25rem" }}>
                      {aiExplanations[item.position]}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className={styles.askAiBtn}
                      onClick={() => handleExplainQuestion(item)}
                      disabled={loadingExplanationFor === item.position}
                    >
                      <FiCpu /> {loadingExplanationFor === item.position ? "Generating AI Explanation..." : "Explain with Faithbot AI"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (loadingQuestion && !currentQuestion) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "#64748b" }}>
        Loading protected CBT question slot from server...
      </div>
    );
  }

  if (errorMsg && !currentQuestion) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#b91c1c" }}>
        <h3>{errorMsg}</h3>
        <Link href="/portal/cbt" className="btn btn-primary" style={{ marginTop: "1rem", display: "inline-block" }}>
          Back to CBT Portal
        </Link>
      </div>
    );
  }

  const totalQuestions = attemptMeta?.questionCount || 10;
  const watermarkLabel = watermark
    ? `${watermark.studentName} · ${watermark.admissionNo} · #${watermark.attemptId}`
    : "WORD OF FAITH SCHOOLS PROTECTED CBT";

  return (
    <div
      className={styles.quizLayout}
      style={{ position: "relative", userSelect: "none", WebkitUserSelect: "none" }}
    >
      {/* Strike 1 Full-Screen Warning Modal (10-second countdown per Decision 10.3) */}
      {warningModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(153, 27, 27, 0.94)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            color: "white",
          }}
        >
          <div
            style={{
              background: "#7f1d1d",
              border: "2px solid #fca5a5",
              borderRadius: "16px",
              padding: "2.5rem",
              maxWidth: "560px",
              textAlign: "center",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            <FiAlertTriangle size={54} color="#fde047" style={{ marginBottom: "1rem" }} />
            <h2 style={{ color: "white", margin: "0 0 0.75rem 0" }}>
              INTEGRITY WARNING — STRIKE {attemptMeta?.hardStrikes || 1} OF {attemptMeta?.maxStrikes || 2}
            </h2>
            <p style={{ fontSize: "1rem", lineHeight: 1.6, marginBottom: "1.5rem", color: "#fef2f2" }}>
              {warningModal.message}
            </p>
            <button
              onClick={() => setWarningModal(null)}
              className="btn"
              style={{
                background: "#fde047",
                color: "#7f1d1d",
                fontWeight: 800,
                padding: "0.85rem 1.75rem",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
              }}
            >
              I Have Returned to the Exam ({warningModal.countdown}s)
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Question Map */}
      <div className={styles.questionMap}>
        <div className={styles.mapHeader}>
          <FiGrid /> <span>Questions (1-at-a-time)</span>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: totalQuestions }, (_, idx) => {
            const slotNum = idx + 1;
            const isAnswered = attemptMeta?.answeredMap?.[slotNum];
            return (
              <button
                key={slotNum}
                className={`${styles.gridBtn} ${position === slotNum ? styles.active : ""} ${
                  isAnswered ? styles.answered : ""
                }`}
                onClick={() => loadQuestionSlot(slotNum)}
                disabled={loadingQuestion}
              >
                {slotNum}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "1.5rem",
            padding: "0.85rem",
            background: "#f8fafc",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            fontSize: "0.78rem",
            color: "#475569",
          }}
        >
          <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <FiShield color="#16a34a" /> Integrity Status
          </div>
          <div>
            Strikes:{" "}
            <strong style={{ color: (attemptMeta?.hardStrikes || 0) > 0 ? "#dc2626" : "#15803d" }}>
              {attemptMeta?.hardStrikes || 0} / {attemptMeta?.maxStrikes || 2}
            </strong>
          </div>
          <div style={{ marginTop: "0.25rem" }}>Mode: {attemptMeta?.mode || "PRACTICE"}</div>
        </div>
      </div>

      {/* Main Quiz Area with Dynamic Tiled Student Watermark (Section 7.2) */}
      <div className={styles.mainArea} style={{ position: "relative", overflow: "hidden" }}>
        {/* Tiled Anti-Camera Watermark Overlay */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "3.5rem",
            padding: "2rem",
            opacity: 0.065,
            transform: "rotate(-18deg) scale(1.15)",
            fontSize: "0.82rem",
            fontWeight: 800,
            color: "#0A2540",
            whiteSpace: "nowrap",
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>{watermarkLabel}</div>
          ))}
        </div>

        <header className={styles.header} style={{ position: "relative", zIndex: 2 }}>
          <div className={styles.examInfo}>
            <span className={styles.badge}>{attemptMeta?.examBody || "WASSCE"}</span>
            <span className={styles.subject}>{attemptMeta?.subjectCode?.toUpperCase()}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {attemptMeta?.mode === "MOCK" && (
              <button
                type="button"
                onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
                className="btn btn-outline"
                style={{ padding: "0.35rem 0.65rem", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <FiMaximize /> Fullscreen
              </button>
            )}
            <div className={`${styles.timer} ${timeLeft < 60 ? styles.timerWarning : ""}`}>
              <FiClock /> {formatTime(timeLeft)}
            </div>
          </div>
        </header>

        {currentQuestion && (
          <div className={styles.questionContainer} style={{ position: "relative", zIndex: 2 }}>
            <h3 className={styles.questionNumber}>
              Question {currentQuestion.position} of {totalQuestions}
              {currentQuestion.examYear ? ` · (${currentQuestion.examBody} ${currentQuestion.examYear})` : ""}
            </h3>
            <div className={styles.questionText} style={{ fontSize: "1.08rem", lineHeight: 1.6 }}>
              {cleanHtmlText(currentQuestion.stem)}
            </div>
            {currentQuestion.imageUrl && (
              <img src={currentQuestion.imageUrl} alt="Question figure" className={styles.qImage} />
            )}

            <div className={styles.optionsList}>
              {currentQuestion.options.map((opt) => {
                const isSelected = currentQuestion.selectedKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    className={`${styles.optionBtn} ${isSelected ? styles.selected : ""}`}
                    onClick={() => handleSelectOption(opt.key)}
                    disabled={loadingQuestion}
                  >
                    <span className={styles.optionLetter}>{opt.key.toUpperCase()}</span>
                    <span>{cleanHtmlText(opt.text)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <footer className={styles.footer} style={{ position: "relative", zIndex: 2 }}>
          <button
            className={styles.navBtn}
            disabled={position <= 1 || loadingQuestion}
            onClick={() => loadQuestionSlot(position - 1)}
          >
            <FiArrowLeft /> Previous
          </button>

          {position === totalQuestions ? (
            <button
              className={styles.submitBtn}
              onClick={() => {
                if (confirm("Are you ready to submit your CBT attempt for server-side grading?")) {
                  handleFinalSubmit();
                }
              }}
              disabled={loadingQuestion}
            >
              Submit Exam <FiCheckCircle />
            </button>
          ) : (
            <button
              className={styles.navBtn}
              disabled={loadingQuestion}
              onClick={() => loadQuestionSlot(position + 1)}
            >
              Next <FiArrowRight />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
