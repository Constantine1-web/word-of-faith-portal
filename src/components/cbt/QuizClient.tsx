"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./QuizClient.module.css";
import Link from "next/link";
import {
  getQuestion,
  saveAnswer,
  saveAnswerBatch,
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

function getElapsedSince(loadedAtMs: number): number {
  return loadedAtMs > 0 ? Math.max(0, Date.now() - loadedAtMs) : 0;
}

function getRemainingSeconds(expiresAtIso: string): number {
  return Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
}

export default function QuizClient({ attemptId }: QuizClientProps) {
  const [position, setPosition] = useState(1);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [attemptMeta, setAttemptMeta] = useState<{
    id: string;
    subjectCode: string;
    examBody: string;
    mode: string;
    examTitle?: string | null;
    examType?: string | null;
    isOfficialExam?: boolean;
    strictMode?: boolean;
    questionCount: number;
    expiresAt: string;
    hardStrikes: number;
    maxStrikes: number;
    answeredMap: Record<number, boolean>;
  } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [queuedAnswerCount, setQueuedAnswerCount] = useState<number>(0);
  const hasEnteredFullscreenRef = useRef<boolean>(false);
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
        attemptId,
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

  const questionLoadedAtRef = useRef<number>(0);
  const blurStartedAtRef = useRef<number | null>(null);

  const getTabSessionToken = useCallback(() => {
    if (typeof window === "undefined") return undefined;
    const key = `wofs_cbt_tok_${attemptId}`;
    let tok = window.sessionStorage.getItem(key);
    if (!tok) {
      tok = `tab:client-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(key, tok);
    }
    return tok;
  }, [attemptId]);

  const readPendingQueueMap = useCallback((): Record<
    string,
    { position: number; selectedKey: string; timeSpentMs?: number }
  > => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.sessionStorage.getItem(`wofs_cbt_pending_${attemptId}`);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [attemptId]);

  const flushOfflineAnswerQueue = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return true;
    const qKey = `wofs_cbt_pending_${attemptId}`;
    const parsedMap = readPendingQueueMap();
    const list = Object.values(parsedMap);
    if (list.length === 0) return true;

    try {
      const res = await saveAnswerBatch({
        attemptId,
        sessionToken: getTabSessionToken(),
        answers: list,
      });
      if (res.success) {
        window.sessionStorage.removeItem(qKey);
        setQueuedAnswerCount(0);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [attemptId, getTabSessionToken, readPendingQueueMap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      flushOfflineAnswerQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushOfflineAnswerQueue]);

  const handleFinalSubmit = useCallback(
    async (isManualClick = false) => {
      setLoadingQuestion(true);
      const pendingBeforeSubmit = Object.keys(readPendingQueueMap()).length;
      const synced = await flushOfflineAnswerQueue();
      if (!synced && isManualClick && pendingBeforeSubmit > 0) {
        setErrorMsg(
          `Network offline: ${pendingBeforeSubmit} locally saved answer(s) could not be synced yet. Restore internet connectivity and click Submit again so none of your answers are lost.`
        );
        setLoadingQuestion(false);
        return;
      }

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
    },
    [attemptId, flushOfflineAnswerQueue, readPendingQueueMap]
  );

  // Fetch ONLY the single active question slot from the server
  const loadQuestionSlot = useCallback(
    async (targetPos: number) => {
      setLoadingQuestion(true);
      setErrorMsg(null);
      await flushOfflineAnswerQueue();
      const res = await getQuestion(attemptId, targetPos, getTabSessionToken());
      if (res.success && res.question && res.attempt) {
        const pendingMap = readPendingQueueMap();
        const mergedAnswered = { ...res.attempt.answeredMap };
        for (const pKey of Object.keys(pendingMap)) {
          mergedAnswered[Number(pKey)] = true;
        }
        const pendingForSlot = pendingMap[String(res.question.position)];
        setAttemptMeta({ ...res.attempt, answeredMap: mergedAnswered });
        setWatermark(res.watermark || null);
        setCurrentQuestion(
          pendingForSlot ? { ...res.question, selectedKey: pendingForSlot.selectedKey } : res.question
        );
        setPosition(res.question.position);
        questionLoadedAtRef.current = Date.now();

        setTimeLeft(getRemainingSeconds(res.attempt.expiresAt));
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
    [attemptId, getTabSessionToken, flushOfflineAnswerQueue, readPendingQueueMap]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initialPending = readPendingQueueMap();
      const initialCount = Object.keys(initialPending).length;
      if (!cancelled && initialCount > 0) {
        setQueuedAnswerCount(initialCount);
        await flushOfflineAnswerQueue();
      }

      const res = await getQuestion(attemptId, 1, getTabSessionToken());
      if (cancelled) return;
      if (res.success && res.question && res.attempt) {
        const remainingPending = readPendingQueueMap();
        const mergedAnswered = { ...res.attempt.answeredMap };
        for (const pKey of Object.keys(remainingPending)) {
          mergedAnswered[Number(pKey)] = true;
        }
        const pendingForSlot = remainingPending[String(res.question.position)];
        setAttemptMeta({ ...res.attempt, answeredMap: mergedAnswered });
        setWatermark(res.watermark || null);
        setCurrentQuestion(
          pendingForSlot ? { ...res.question, selectedKey: pendingForSlot.selectedKey } : res.question
        );
        setPosition(res.question.position);
        questionLoadedAtRef.current = Date.now();
        setTimeLeft(getRemainingSeconds(res.attempt.expiresAt));
      } else if (res.terminated || res.dayLocked) {
        setTerminatedReason(res.error || "Attempt terminated due to exam integrity violation.");
      } else if (res.submitted || res.expired) {
        const finalRes = await submitAttempt(attemptId);
        if (!cancelled && finalRes.success && finalRes.summary) {
          setSubmittedResult({
            summary: finalRes.summary,
            reviewItems: finalRes.reviewItems || [],
          });
        }
      } else {
        setErrorMsg(res.error || "Unable to load question.");
      }
      if (!cancelled) {
        setLoadingQuestion(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, getTabSessionToken, flushOfflineAnswerQueue, readPendingQueueMap]);

  // Server-authoritative countdown timer
  useEffect(() => {
    if (submittedResult || terminatedReason || !attemptMeta) return;

    const interval = setInterval(() => {
      const remaining = getRemainingSeconds(attemptMeta.expiresAt);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleFinalSubmit();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [attemptMeta, submittedResult, terminatedReason, handleFinalSubmit]);

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
  }, [attemptId, submittedResult, terminatedReason, handleFinalSubmit]);

  // 10-second Strike 1 Warning Modal Countdown
  useEffect(() => {
    if (!warningModal) return;
    const t = setTimeout(
      () => {
        setWarningModal((prev) =>
          !prev || prev.countdown <= 1 ? null : { ...prev, countdown: prev.countdown - 1 }
        );
      },
      warningModal.countdown <= 0 ? 0 : 1000
    );
    return () => clearTimeout(t);
  }, [warningModal]);

  // Page Visibility, Window Blur, Fullscreen, PrintScreen & Copy/Paste Integrity Listeners (Section 7.2 & 7.3)
  // Enforced for Supervised Mock (MOCK) AND Official Exam Strict Mode (EXAM when strictMode enabled).
  const isStrictProctoring =
    attemptMeta?.mode === "MOCK" ||
    (attemptMeta?.mode === "EXAM" && attemptMeta?.strictMode !== false);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fullscreenElement) return;
    hasEnteredFullscreenRef.current = true;
    const rafId = window.requestAnimationFrame(() => {
      setIsFullscreen(true);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [attemptMeta?.id]);

  useEffect(() => {
    if (submittedResult || terminatedReason || !isStrictProctoring) return;

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
            "Strike limit reached: Your CBT attempt has been terminated and your account is locked for today."
        );
      } else if (res.status === "WARNING") {
        setAttemptMeta((prev) =>
          prev ? { ...prev, hardStrikes: res.hardStrikes ?? prev.hardStrikes + 1 } : prev
        );
        setWarningModal({
          message:
            res.message ||
            "INTEGRITY STRIKE DETECTED: Return immediately or your exam will be terminated.",
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
      const nowFull = Boolean(document.fullscreenElement);
      setIsFullscreen(nowFull);
      if (nowFull) {
        hasEnteredFullscreenRef.current = true;
        return;
      }
      if (attemptMeta?.mode === "MOCK" || hasEnteredFullscreenRef.current) {
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

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      const isPrintOrSave =
        key === "printscreen" ||
        ((e.ctrlKey || e.metaKey) && (key === "p" || key === "s"));
      const isDevTools =
        key === "f12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === "i" || key === "j" || key === "c")) ||
        ((e.ctrlKey || e.metaKey) && key === "u");

      if (isPrintOrSave) {
        e.preventDefault();
        reportIntegrityEvent({ attemptId, type: "PRINT_ATTEMPT" });
      } else if (isDevTools) {
        e.preventDefault();
        reportIntegrityEvent({ attemptId, type: "DEVTOOLS_SUSPECT" });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [attemptId, attemptMeta?.mode, isStrictProctoring, submittedResult, terminatedReason]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectOption = async (optionKey: string) => {
    if (!currentQuestion || !attemptMeta || submittedResult || terminatedReason) return;

    const spentMs = getElapsedSince(questionLoadedAtRef.current);
    setCurrentQuestion((prev) => (prev ? { ...prev, selectedKey: optionKey } : prev));
    setAttemptMeta((prev) =>
      prev
        ? {
            ...prev,
            answeredMap: { ...prev.answeredMap, [currentQuestion.position]: true },
          }
        : prev
    );

    const queueOfflineAnswer = () => {
      if (typeof window === "undefined") return;
      const qKey = `wofs_cbt_pending_${attemptId}`;
      try {
        const current = JSON.parse(window.sessionStorage.getItem(qKey) || "{}");
        current[String(currentQuestion.position)] = {
          position: currentQuestion.position,
          selectedKey: optionKey,
          timeSpentMs: spentMs,
        };
        window.sessionStorage.setItem(qKey, JSON.stringify(current));
        setQueuedAnswerCount(Object.keys(current).length);
      } catch {}
    };

    try {
      const res = await saveAnswer({
        attemptId,
        position: currentQuestion.position,
        selectedKey: optionKey,
        timeSpentMs: spentMs,
        sessionToken: getTabSessionToken(),
      });

      if (res.dayLocked) {
        setTerminatedReason(res.error || "CBT access locked for today.");
      } else if (res.expired) {
        handleFinalSubmit();
      } else if (!res.success) {
        queueOfflineAnswer();
      } else if (queuedAnswerCount > 0) {
        flushOfflineAnswerQueue();
      }
    } catch {
      queueOfflineAnswer();
    }
  };

  // 1. Terminated & Day-Locked View
  if (terminatedReason) {
    return (
      <div style={{ maxWidth: "640px", margin: "3rem auto", background: "var(--status-error-bg)", border: "2px solid var(--status-error-border)", borderRadius: "16px", padding: "2.5rem", textAlign: "center" }}>
        <FiLock size={48} color="var(--status-error-text)" style={{ marginBottom: "1rem" }} />
        <h2 style={{ color: "var(--status-error-text)", marginBottom: "0.75rem" }}>
          CBT Attempt Terminated & Day-Lock Active
        </h2>
        <p style={{ color: "var(--text-primary)", fontSize: "0.96rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          {terminatedReason}
        </p>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "1rem", borderRadius: "8px", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
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
    const isScoreWithheld = Boolean(summary.scoreWithheld);
    const isAnswersWithheld = Boolean(summary.answersWithheld);

    return (
      <div className={styles.resultsContainer}>
        <div className={styles.scoreCard}>
          <h2>
            {summary.examTitle
              ? `${summary.examTitle} — Submitted & Recorded`
              : "Exam Submitted & Graded Server-Side"}
          </h2>

          {isScoreWithheld ? (
            <div
              style={{
                background: "var(--status-info-bg)",
                border: "1px solid var(--status-info-border)",
                color: "var(--status-info-text)",
                padding: "1.1rem 1.25rem",
                borderRadius: "10px",
                margin: "1rem 0",
                fontWeight: 700,
              }}
            >
              <FiLock style={{ marginRight: "0.4rem", verticalAlign: "middle" }} />
              Your answers have been locked and graded confidentially on the server ({summary.questionCount} questions). Your official score will appear once the Examiner closes the exam hall.
            </div>
          ) : (
            <>
              <div className={styles.scoreCircle}>
                <span>{summary.percentage}%</span>
              </div>
              <p>
                You scored <strong>{summary.correctCount}</strong> out of{" "}
                <strong>{summary.questionCount}</strong> ({summary.subjectCode.toUpperCase()} ·{" "}
                {summary.examBody})
              </p>
            </>
          )}

          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Integrity Strikes Recorded: {summary.hardStrikes} / {attemptMeta?.maxStrikes || 2}
          </p>
          <div className={styles.resultActions}>
            <Link href="/portal/cbt" className={styles.dashboardBtn}>
              Return to CBT Portal
            </Link>
          </div>

          {!isAnswersWithheld && (
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
                      <strong style={{ color: "var(--status-success-text)" }}>Key Strengths:</strong>
                      <ul>
                        {aiAnalysis.strengths.map((s, idx) => (
                          <li key={idx}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiAnalysis.weaknesses.length > 0 && (
                    <div className={styles.aiSection}>
                      <strong style={{ color: "var(--status-error-text)" }}>Areas for Revision:</strong>
                      <ul>
                        {aiAnalysis.weaknesses.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiAnalysis.recommendations.length > 0 && (
                    <div className={styles.aiSection}>
                      <strong style={{ color: "var(--status-info-text)" }}>Examiner Recommendations:</strong>
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
          )}
        </div>

        {isAnswersWithheld ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              borderRadius: "12px",
              padding: "1.5rem",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            <FiShield size={28} color="var(--color-navy-blue)" style={{ marginBottom: "0.5rem" }} />
            <h3 style={{ margin: "0 0 0.4rem 0", color: "var(--color-navy-blue)" }}>
              Question Review &amp; Solutions Held Confidential
            </h3>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              To protect examination integrity while other students complete their attempt, questions, official solutions, and AI explanations remain hidden until released by your Examiner.
            </p>
          </div>
        ) : (
          <div className={styles.correctionsWrapper}>
            <h3>Attempt Review &amp; Step-by-Step Explanations</h3>
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
        )}
      </div>
    );
  }

  if (loadingQuestion && !currentQuestion) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "var(--text-muted)" }}>
        Loading protected CBT question slot from server...
      </div>
    );
  }

  if (errorMsg && !currentQuestion) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--status-error-text)" }}>
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
      {/* Mandatory Fullscreen Exam Hall Gate for Official EXAM Strict Mode */}
      {attemptMeta?.mode === "EXAM" &&
        attemptMeta?.strictMode !== false &&
        !isFullscreen &&
        !warningModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(10, 37, 64, 0.97)",
              zIndex: 9998,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.5rem",
              color: "#ffffff",
            }}
          >
            <div
              style={{
                maxWidth: "520px",
                background: "#0f172a",
                border: "2px solid #22c55e",
                borderRadius: "16px",
                padding: "2.25rem",
                textAlign: "center",
              }}
            >
              <FiMaximize size={48} color="#22c55e" style={{ marginBottom: "0.9rem" }} />
              <h2 style={{ margin: "0 0 0.65rem 0", color: "#ffffff" }}>
                {attemptMeta?.examTitle || "Official CBT Examination — Strict Mode"}
              </h2>
              <p style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#cbd5e1", marginBottom: "1.35rem" }}>
                Full-screen Exam Hall mode is required before questions are displayed. Exiting full-screen, switching tabs, copying, or opening developer tools counts as a strike ({attemptMeta?.maxStrikes || 2}-strike termination policy).
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await document.documentElement.requestFullscreen?.();
                    hasEnteredFullscreenRef.current = true;
                    setIsFullscreen(true);
                  } catch {
                    setIsFullscreen(true);
                  }
                }}
                className="btn btn-primary"
                style={{ fontSize: "1rem", padding: "0.85rem 1.75rem" }}
              >
                Enter Fullscreen Exam Hall
              </button>
            </div>
          </div>
        )}

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
            background: "var(--bg-secondary)",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
            fontSize: "0.78rem",
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <FiShield color={isStrictProctoring ? "#ef4444" : "#22c55e"} />{" "}
            {attemptMeta?.mode === "EXAM"
              ? "Exam Strict Mode"
              : attemptMeta?.mode === "MOCK"
              ? "Strict Exam Integrity"
              : "Self-Paced Practice"}
          </div>
          {isStrictProctoring ? (
            <div>
              Strikes:{" "}
              <strong style={{ color: (attemptMeta?.hardStrikes || 0) > 0 ? "var(--status-error-text)" : "var(--status-success-text)" }}>
                {attemptMeta?.hardStrikes || 0} / {attemptMeta?.maxStrikes || 2}
              </strong>
            </div>
          ) : (
            <div style={{ color: "var(--status-success-text)", fontWeight: 600 }}>
              No Strike Penalties Active
            </div>
          )}
          <div style={{ marginTop: "0.25rem" }}>
            Mode:{" "}
            <strong>
              {attemptMeta?.mode === "EXAM"
                ? "Official Class Exam"
                : attemptMeta?.mode === "MOCK"
                ? "Strict Exam"
                : "Self-Paced Study"}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className={styles.submitBtn}
          style={{ marginTop: "1rem", width: "100%", justifyContent: "center" }}
          onClick={() => {
            if (confirm("Are you ready to submit your CBT attempt for server-side grading?")) {
              handleFinalSubmit(true);
            }
          }}
          disabled={loadingQuestion}
        >
          Submit Exam <FiCheckCircle />
        </button>
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
            color: "var(--text-primary)",
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
            {queuedAnswerCount > 0 && (
              <span
                style={{
                  padding: "0.28rem 0.65rem",
                  borderRadius: "999px",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  background: "var(--status-warning-bg)",
                  color: "var(--status-warning-text)",
                  border: "1px solid var(--status-warning-border)",
                }}
              >
                Offline Queue: {queuedAnswerCount} Saved Locally
              </span>
            )}
            {isStrictProctoring && (
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
                  handleFinalSubmit(true);
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
