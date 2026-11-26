"use client";

import { useState, useEffect, useCallback } from "react";
import {
  scanDocumentToExamQuestionsAction,
  bulkSaveReviewedExamQuestions,
  getTeacherScopedBankQuestions,
  toggleSchoolCbtQuestionActive,
  type SchoolInternalQuestionRow,
} from "@/app/actions/cbtAuthoring";
import {
  getTeacherExamStudioData,
  saveScheduledExam,
  updateScheduledExamStatus,
  getScheduledExamMonitorData,
  grantExamAttemptRetake,
  previewStrictExamScoresForResultSync,
} from "@/app/actions/cbtExams";
import {
  getOrCreateTeacherSubmissionPacket,
  getTeacherQuestionSubmissions,
  submitQuestionPacketForReview,
} from "@/app/actions/cbtSubmissions";
import {
  SUBJECTS,
  SCHOOL_INTERNAL_SUBJECT_PRESETS,
  formatCbtSubjectLabel,
} from "@/lib/cbt-constants";
import type { ScannedCbtQuestionDraft } from "@/lib/cbt-ocr";
import {
  FiCamera,
  FiUploadCloud,
  FiShield,
  FiLock,
  FiPlay,
  FiCheckCircle,
  FiAlertTriangle,
  FiTrash2,
  FiPlus,
  FiEye,
  FiRefreshCw,
  FiAward,
  FiClock,
  FiFileText,
  FiArchive,
  FiUnlock,
  FiSliders,
  FiSend,
  FiKey,
} from "react-icons/fi";

const ALL_CBT_SUBJECTS = Array.from(new Set([...SUBJECTS, ...SCHOOL_INTERNAL_SUBJECT_PRESETS]));

async function optimizeUploadIfLargeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 900 * 1024) {
    return file;
  }
  try {
    const imgUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imgUrl;
    });
    URL.revokeObjectURL(imgUrl);

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export interface AppliedExamScoreSyncPayload {
  classId: number;
  subjectId: number;
  targetColumn: "ca" | "exam";
  maxWeight: number;
  items: Array<{
    studentId: number;
    hasAttempt: boolean;
    scaledScore: number | null;
  }>;
  examTitle: string;
}

export default function ExamBankAndSchedulerStudio({
  mode = "teacher",
  onApplyScoresToResultGrid,
}: {
  mode?: "teacher" | "admin";
  onApplyScoresToResultGrid?: (payload: AppliedExamScoreSyncPayload) => void;
}) {
  const [studioSection, setStudioSection] = useState<"submissions" | "scanner" | "scheduler" | "bank">(
    mode === "admin" ? "scheduler" : "scanner"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Studio Core Data
  const [activeTermLabel, setActiveTermLabel] = useState("");
  const [allocations, setAllocations] = useState<any[]>([]);
  const [scheduledExams, setScheduledExams] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string>("");
  const [subAllocKey, setSubAllocKey] = useState<string>("");
  const [subExamType, setSubExamType] = useState<"CA_TEST" | "MIDTERM" | "TERMINAL_EXAM">("TERMINAL_EXAM");
  const [subTargetGoal, setSubTargetGoal] = useState<number>(20);
  const [submittingPacketId, setSubmittingPacketId] = useState<string | null>(null);
  const [creatingPacket, setCreatingPacket] = useState(false);
  const [subNotesMap, setSubNotesMap] = useState<Record<string, string>>({});
  const [bankSummaryMap, setBankSummaryMap] = useState<
    Record<string, { examOnlyCount: number; openBankCount: number }>
  >({});
  const [bankQuestions, setBankQuestions] = useState<SchoolInternalQuestionRow[]>([]);
  const [bankScopeFilter, setBankScopeFilter] = useState<"ALL" | "EXAM_ONLY" | "OPEN_BANK">("EXAM_ONLY");
  const [bankSubjectFilter, setBankSubjectFilter] = useState<string>("all");

  // OCR Scanner State
  const [scanInputMode, setScanInputMode] = useState<"file" | "text">("file");
  const [scanSubjectCode, setScanSubjectCode] = useState<string>("mathematics");
  const [scanBankScope, setScanBankScope] = useState<"EXAM_ONLY" | "OPEN_BANK">("EXAM_ONLY");
  const [scanClassLevel, setScanClassLevel] = useState<string>("");
  const [scanTopic, setScanTopic] = useState<string>("Term Exam Question");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanRawText, setScanRawText] = useState<string>("");
  const [attachToExamId, setAttachToExamId] = useState<string>("");
  const [scanningDoc, setScanningDoc] = useState(false);
  const [stagedDrafts, setStagedDrafts] = useState<Array<ScannedCbtQuestionDraft & { selected: boolean }>>([]);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [savingScannedBatch, setSavingScannedBatch] = useState(false);

  // Strict Exam Scheduler Form State
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [exTitle, setExTitle] = useState("");
  const [exAllocKey, setExAllocKey] = useState("");
  const [exSubjectCode, setExSubjectCode] = useState("mathematics");
  const [exType, setExType] = useState<"CA_TEST" | "MIDTERM" | "TERMINAL_EXAM">("TERMINAL_EXAM");
  const [exQuestionCount, setExQuestionCount] = useState(20);
  const [exDurationMin, setExDurationMin] = useState(30);
  const [exStrictMode, setExStrictMode] = useState(true);
  const [exMaxStrikes, setExMaxStrikes] = useState<1 | 2>(2);
  const [exAccessCode, setExAccessCode] = useState("");
  const [exClearPin, setExClearPin] = useState(false);
  const [exRequireFeeClearance, setExRequireFeeClearance] = useState(true);
  const [exRevealScore, setExRevealScore] = useState(false);
  const [exStatus, setExStatus] = useState<"DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED">("SCHEDULED");
  const [exStartsAt, setExStartsAt] = useState("");
  const [exEndsAt, setExEndsAt] = useState("");
  const [pinnedQuestionIds, setPinnedQuestionIds] = useState<string[]>([]);
  const [savingExam, setSavingExam] = useState(false);

  // Live Monitor & Result Sync Modals
  const [monitorData, setMonitorData] = useState<any | null>(null);
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [syncPreview, setSyncPreview] = useState<{
    exam: any;
    targetColumn: "ca" | "exam";
    maxWeight: number;
    data: any;
  } | null>(null);

  const fetchStudioSnapshot = useCallback(async () => {
    const [studioRes, bankRes, subRes] = await Promise.all([
      getTeacherExamStudioData(),
      getTeacherScopedBankQuestions({
        subjectCode: bankSubjectFilter !== "all" ? bankSubjectFilter : undefined,
        bankScope: bankScopeFilter,
      }),
      getTeacherQuestionSubmissions(),
    ]);
    return { studioRes, bankRes, subRes };
  }, [bankScopeFilter, bankSubjectFilter]);

  const applyStudioSnapshot = useCallback(
    ({ studioRes, bankRes, subRes }: Awaited<ReturnType<typeof fetchStudioSnapshot>>) => {
      if (studioRes.success) {
        setActiveTermLabel(
          studioRes.activeTerm
            ? `${studioRes.activeTerm.SessionName} · ${studioRes.activeTerm.TermName}`
            : ""
        );
        const allocs = studioRes.allocations || [];
        setAllocations(allocs);
        setScheduledExams(studioRes.scheduledExams || []);
        setBankSummaryMap(studioRes.bankSummaryMap || {});

        if (allocs.length > 0) {
          const first = allocs[0];
          const firstKey = `${first.classId}:${first.subjectId}`;
          setExAllocKey((prev) => {
            if (!prev && first.cbtCodes?.[0]) {
              setExSubjectCode(first.cbtCodes[0]);
              setScanSubjectCode(first.cbtCodes[0]);
            }
            return prev || firstKey;
          });
          setSubAllocKey((prev) => prev || firstKey);
        }
      } else if (studioRes.error) {
        setError(studioRes.error);
      }

      if (subRes.success) {
        const list = subRes.submissions || [];
        setSubmissions(list);
        const editable = list.find(
          (s: any) => s.status === "DRAFT" || s.status === "REVISION_REQUESTED"
        );
        if (editable) {
          setActiveSubmissionId((prev) => prev || editable.id);
        }
      }

      if (bankRes.success) {
        setBankQuestions(bankRes.questions || []);
      }
      setLoading(false);
    },
    []
  );

  const loadStudio = useCallback(async () => {
    setLoading(true);
    const snap = await fetchStudioSnapshot();
    applyStudioSnapshot(snap);
  }, [fetchStudioSnapshot, applyStudioSnapshot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await fetchStudioSnapshot();
      if (!cancelled) {
        applyStudioSnapshot(snap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStudioSnapshot, applyStudioSnapshot]);

  const handleScanDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setScanWarnings([]);

    if (scanInputMode === "file" && !scanFile) {
      setError("Please select or snap a clear photo/PDF of your question sheet.");
      return;
    }
    if (scanInputMode === "text" && scanRawText.trim().length < 20) {
      setError("Paste at least one numbered question with options A–D.");
      return;
    }

    setScanningDoc(true);
    try {
      const fd = new FormData();
      fd.append("subjectCode", scanSubjectCode);
      fd.append("defaultTopic", scanTopic);

      if (scanInputMode === "file" && scanFile) {
        const readyFile = await optimizeUploadIfLargeImage(scanFile);
        fd.append("file", readyFile);
      } else {
        fd.append("rawText", scanRawText);
      }

      const res = await scanDocumentToExamQuestionsAction(fd);
      if (res.success && res.questions.length > 0) {
        setStagedDrafts(res.questions.map((q) => ({ ...q, selected: true })));
        setScanWarnings(res.warnings || []);
        setSuccess(
          `Extracted ${res.questions.length} question(s) (${res.engine}). Review each item & answer key below before saving to the bank.`
        );
      } else {
        setError(res.error || "Could not extract questions from this document.");
      }
    } catch (err: any) {
      setError(err?.message || "Document scan failed.");
    } finally {
      setScanningDoc(false);
    }
  };

  const handleCommitScannedDrafts = async () => {
    const chosen = stagedDrafts.filter((d) => d.selected);
    if (chosen.length === 0) {
      setError("Check at least one extracted question to commit to the bank.");
      return;
    }

    setSavingScannedBatch(true);
    setError("");
    setSuccess("");

    const res = await bulkSaveReviewedExamQuestions({
      subjectCode: scanSubjectCode,
      examBody: "SCHOOL_INTERNAL",
      bankScope: scanBankScope,
      targetClassLevel: scanClassLevel || null,
      attachToExamId: attachToExamId || undefined,
      submissionId: scanBankScope === "EXAM_ONLY" && activeSubmissionId ? activeSubmissionId : undefined,
      questions: chosen.map((d) => ({
        stem: d.stem,
        optionA: d.optionA,
        optionB: d.optionB,
        optionC: d.optionC,
        optionD: d.optionD,
        correctKey: d.correctKey,
        topic: d.topic,
        explanation: d.explanation,
      })),
    });

    if (res.success) {
      setSuccess(
        `Saved ${res.savedCount} question(s) into ${formatCbtSubjectLabel(scanSubjectCode)} (${scanBankScope === "EXAM_ONLY" ? "Confidential Exam Bank" : "Open Practice Pool"})${attachToExamId ? " and attached to exam" : ""}!`
      );
      setStagedDrafts([]);
      setScanFile(null);
      setScanRawText("");
      await loadStudio();
    } else {
      setError(res.error || "Failed to save scanned questions.");
    }
    setSavingScannedBatch(false);
  };

  const handleAllocSelect = (allocKey: string) => {
    setExAllocKey(allocKey);
    const found = allocations.find((a) => `${a.classId}:${a.subjectId}` === allocKey);
    if (found?.cbtCodes?.[0]) {
      setExSubjectCode(found.cbtCodes[0]);
      if (!exTitle.trim()) {
        setExTitle(`${found.className} ${found.subjectName} CBT Exam`);
      }
    }
  };

  const resetExamForm = () => {
    setEditingExamId(null);
    setExTitle("");
    setExType("TERMINAL_EXAM");
    setExQuestionCount(20);
    setExDurationMin(30);
    setExStrictMode(true);
    setExMaxStrikes(2);
    setExAccessCode("");
    setExClearPin(false);
    setExRequireFeeClearance(true);
    setExRevealScore(false);
    setExStatus("SCHEDULED");
    setExStartsAt("");
    setExEndsAt("");
    setPinnedQuestionIds([]);
  };

  const handleCreateOrSyncPacket = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = allocations.find((a) => `${a.classId}:${a.subjectId}` === subAllocKey);
    if (!found) {
      setError("Select an assigned Class & Subject allocation first.");
      return;
    }
    setCreatingPacket(true);
    setError("");
    setSuccess("");
    const res = await getOrCreateTeacherSubmissionPacket({
      classId: found.classId,
      subjectId: found.subjectId,
      examType: subExamType,
      targetQuestionGoal: subTargetGoal,
    });
    if (res.success && res.packet) {
      setActiveSubmissionId(res.packet.id);
      setSuccess(
        `Question Packet "${res.packet.title}" initialized & synced with your ${formatCbtSubjectLabel(res.packet.subjectCode)} EXAM_ONLY bank.`
      );
      await loadStudio();
    } else {
      setError(res.error || "Unable to create question submission packet.");
    }
    setCreatingPacket(false);
  };

  const handleSubmitPacketForReview = async (submissionId: string) => {
    setSubmittingPacketId(submissionId);
    setError("");
    setSuccess("");
    const res = await submitQuestionPacketForReview({
      submissionId,
      notes: subNotesMap[submissionId] || undefined,
    });
    if (res.success) {
      setSuccess(
        "Question packet submitted to Examination Officer / Vice Principal for review! Initial submission timestamp & revision snapshot locked."
      );
      await loadStudio();
    } else {
      setError(res.error || "Failed to submit question packet.");
    }
    setSubmittingPacketId(null);
  };

  const handleSaveScheduledExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = allocations.find((a) => `${a.classId}:${a.subjectId}` === exAllocKey);
    if (!found) {
      setError("Select a Class & Subject allocation first.");
      return;
    }

    setSavingExam(true);
    setError("");
    setSuccess("");

    const res = await saveScheduledExam({
      id: editingExamId || undefined,
      title: exTitle.trim(),
      classId: found.classId,
      subjectId: found.subjectId,
      subjectCode: exSubjectCode,
      examType: exType,
      strictMode: exStrictMode,
      maxStrikes: exMaxStrikes,
      questionCount: exQuestionCount,
      durationMinutes: exDurationMin,
      startsAt: exStartsAt ? new Date(exStartsAt).toISOString() : null,
      endsAt: exEndsAt ? new Date(exEndsAt).toISOString() : null,
      accessCode: exAccessCode.trim() || null,
      clearAccessCode: exClearPin,
      requireFeeClearance: exRequireFeeClearance,
      revealScoreAfterSubmit: exRevealScore,
      answersReleased: false,
      status: mode === "teacher" && exStatus === "LIVE" ? "SCHEDULED" : exStatus,
      pinnedQuestionIds: pinnedQuestionIds.length > 0 ? pinnedQuestionIds : undefined,
    });

    if (res.success) {
      setSuccess(`Scheduled strict exam "${exTitle}" saved (${exStatus}).`);
      resetExamForm();
      await loadStudio();
    } else {
      setError(res.error || "Failed to save scheduled exam.");
    }
    setSavingExam(false);
  };

  const handleExamLifecycle = async (
    examId: string,
    payload: {
      status?: "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED";
      answersReleased?: boolean;
      revealScoreAfterSubmit?: boolean;
    }
  ) => {
    setError("");
    setSuccess("");
    const res = await updateScheduledExamStatus({ examId, ...payload });
    if (res.success) {
      setSuccess("Examination status / visibility updated.");
      await loadStudio();
      if (monitorData?.exam?.id === examId) {
        handleOpenMonitor(examId);
      }
    } else {
      setError(res.error || "Failed to update examination status.");
    }
  };

  const handleOpenMonitor = async (examId: string) => {
    setLoadingMonitor(true);
    const res = await getScheduledExamMonitorData(examId);
    setLoadingMonitor(false);
    if (res.success) {
      setMonitorData(res);
    } else {
      setError(res.error || "Could not load monitor view.");
    }
  };

  const handleGrantRetake = async (attemptId: string, studentName: string) => {
    const reason = prompt(
      `Enter audited reason for allowing ${studentName} to retake this official exam (e.g., Power outage / Browser crash):`
    );
    if (!reason || reason.trim().length < 5) return;
    const res = await grantExamAttemptRetake({ attemptId, reason: reason.trim() });
    if (res.success) {
      setSuccess(`Retake clearance granted for ${studentName}.`);
      if (monitorData?.exam?.id) {
        await handleOpenMonitor(monitorData.exam.id);
      }
    } else {
      setError(res.error || "Failed to grant retake.");
    }
  };

  const handleOpenSyncPreview = async (
    exam: any,
    targetColumn: "ca" | "exam",
    maxWeight: number
  ) => {
    setError("");
    const res = await previewStrictExamScoresForResultSync({
      examId: exam.id,
      maxWeight,
    });
    if (res.success) {
      setSyncPreview({ exam, targetColumn, maxWeight, data: res });
    } else {
      setError(res.error || "Unable to load exam scores for sync.");
    }
  };

  const activeSubjectBankCount = bankSummaryMap[exSubjectCode]?.examOnlyCount || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "2rem" }}>
      {/* Sub-navigation Header */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
          borderRadius: "var(--radius-lg)",
          padding: "1.25rem 1.5rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "var(--color-navy-blue)",
                fontSize: "1.2rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <FiShield color="var(--color-primary-green)" /> Exam Question Bank &amp; Exam Strict Mode Studio
            </h2>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.84rem", color: "var(--text-muted)" }}>
              Snap/upload handwritten question sheets into a confidential <strong>EXAM-ONLY Bank</strong>, then launch <strong>Exam Strict Mode</strong> for your class on exam day.
              {activeTermLabel ? ` · Term: ${activeTermLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={loadStudio}
            disabled={loading}
            className="btn btn-outline"
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <FiRefreshCw /> Refresh Studio
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setStudioSection("submissions")}
            className={studioSection === "submissions" ? "btn btn-primary" : "btn btn-outline"}
            style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiSend /> 0. Exam Submissions &amp; Approval ({submissions.length})
          </button>
          <button
            type="button"
            onClick={() => setStudioSection("scanner")}
            className={studioSection === "scanner" ? "btn btn-primary" : "btn btn-outline"}
            style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiCamera /> 1. Scan Paper / Handwritten Sheet to Bank
          </button>
          <button
            type="button"
            onClick={() => setStudioSection("scheduler")}
            className={studioSection === "scheduler" ? "btn btn-primary" : "btn btn-outline"}
            style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiLock /> 2. Strict Exam Scheduler &amp; Live Monitor ({scheduledExams.length})
          </button>
          <button
            type="button"
            onClick={() => setStudioSection("bank")}
            className={studioSection === "bank" ? "btn btn-primary" : "btn btn-outline"}
            style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiFileText /> 3. Subject Question Bank ({bankQuestions.length})
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "8px",
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
            border: "1px solid var(--status-error-border)",
            fontWeight: 600,
            fontSize: "0.88rem",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "8px",
            background: "var(--status-success-bg)",
            color: "var(--status-success-text)",
            border: "1px solid var(--status-success-border)",
            fontWeight: 600,
            fontSize: "0.88rem",
          }}
        >
          {success}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PANEL 0: TEACHER QUESTION SUBMISSION PACKETS & APPROVAL TRACKING      */}
      {/* ===================================================================== */}
      {studioSection === "submissions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.15rem" }}>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-lg)",
              padding: "1.35rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h3 style={{ margin: "0 0 0.35rem 0", color: "var(--color-navy-blue)", fontSize: "1.05rem" }}>
              Initialize &amp; Submit Confidential Exam Packets
            </h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.84rem", color: "var(--text-muted)" }}>
              Prepare your encrypted <strong>EXAM_ONLY</strong> questions per assigned Class &amp; Subject, then submit your packet to the{" "}
              <strong>Examination Officer / Vice Principal</strong>. Once submitted, your <strong>Initial Submission Timestamp</strong> is locked immutably and every subsequent revision is archived.
            </p>

            <form
              onSubmit={handleCreateOrSyncPacket}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "0.75rem",
                alignItems: "end",
              }}
            >
              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Assigned Class &amp; Subject *
                </label>
                <select
                  className="form-input"
                  value={subAllocKey}
                  onChange={(e) => setSubAllocKey(e.target.value)}
                  required
                >
                  {allocations.length === 0 ? (
                    <option value="">No assigned subjects found</option>
                  ) : (
                    allocations.map((a) => (
                      <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>
                        {a.className} · {a.subjectName}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Examination Type *
                </label>
                <select
                  className="form-input"
                  value={subExamType}
                  onChange={(e) => setSubExamType(e.target.value as "CA_TEST" | "MIDTERM" | "TERMINAL_EXAM")}
                >
                  <option value="TERMINAL_EXAM">Terminal Exam</option>
                  <option value="MIDTERM">Mid-Term Test</option>
                  <option value="CA_TEST">CA CBT Quiz</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Target Questions
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="form-input"
                  value={subTargetGoal}
                  onChange={(e) => setSubTargetGoal(Number(e.target.value) || 20)}
                />
              </div>

              <button type="submit" disabled={creatingPacket || allocations.length === 0} className="btn btn-primary">
                <FiPlus style={{ marginRight: "0.3rem" }} />
                {creatingPacket ? "Initializing..." : "Create / Sync Question Packet"}
              </button>
            </form>
          </div>

          {submissions.length === 0 ? (
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px dashed var(--border-primary)",
                borderRadius: "var(--radius-lg)",
                padding: "2rem",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              No submission packets created yet for this term. Initialize your first subject packet above!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              {submissions.map((sub) => {
                const canSubmit = sub.status === "DRAFT" || sub.status === "REVISION_REQUESTED";
                return (
                  <div
                    key={sub.id}
                    style={{
                      background: "var(--bg-card)",
                      border: `1px solid ${
                        sub.status === "APPROVED"
                          ? "var(--status-success-border)"
                          : sub.status === "REVISION_REQUESTED" || sub.status === "REJECTED"
                          ? "var(--status-error-border)"
                          : "var(--border-primary)"
                      }`,
                      borderRadius: "var(--radius-lg)",
                      padding: "1.15rem 1.25rem",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.65rem", marginBottom: "0.55rem" }}>
                      <div>
                        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                          <span
                            style={{
                              padding: "0.18rem 0.6rem",
                              borderRadius: "999px",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              background:
                                sub.status === "APPROVED"
                                  ? "var(--status-success-bg)"
                                  : sub.status === "REVISION_REQUESTED" || sub.status === "REJECTED"
                                  ? "var(--status-error-bg)"
                                  : sub.status === "SUBMITTED" || sub.status === "UNDER_REVIEW"
                                  ? "var(--status-info-bg)"
                                  : "var(--bg-secondary)",
                              color:
                                sub.status === "APPROVED"
                                  ? "var(--status-success-text)"
                                  : sub.status === "REVISION_REQUESTED" || sub.status === "REJECTED"
                                  ? "var(--status-error-text)"
                                  : sub.status === "SUBMITTED" || sub.status === "UNDER_REVIEW"
                                  ? "var(--status-info-text)"
                                  : "var(--text-secondary)",
                            }}
                          >
                            {sub.status.replace(/_/g, " ")}
                          </span>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                            {sub.className} · {sub.subjectName} · Rev #{sub.revisionNumber}
                          </span>
                        </div>
                        <h4 style={{ margin: 0, color: "var(--text-heading)", fontSize: "1rem" }}>{sub.title}</h4>
                      </div>

                      <div style={{ fontSize: "0.77rem", color: "var(--text-muted)", textAlign: "right" }}>
                        <div>
                          Questions: <strong>{sub.questionCount} / {sub.targetQuestionGoal}</strong>
                        </div>
                        <div>
                          Initial Submit:{" "}
                          <strong>
                            {sub.initialSubmittedAt
                              ? new Date(sub.initialSubmittedAt).toLocaleString()
                              : "Not submitted yet"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {sub.reviewerNotes && (
                      <div
                        style={{
                          padding: "0.65rem 0.85rem",
                          borderRadius: "8px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-primary)",
                          fontSize: "0.82rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <strong>Exam Officer Feedback{sub.reviewerEmail ? ` (${sub.reviewerEmail})` : ""}:</strong>{" "}
                        {sub.reviewerNotes}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
                      {canSubmit && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSubmissionId(sub.id);
                              setScanSubjectCode(sub.subjectCode || scanSubjectCode);
                              setScanBankScope("EXAM_ONLY");
                              setStudioSection("scanner");
                            }}
                            className="btn btn-outline"
                            style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            <FiCamera /> Scan / Add Questions to Packet
                          </button>

                          <input
                            type="text"
                            className="form-input"
                            placeholder="Optional note for Exam Officer..."
                            value={subNotesMap[sub.id] || ""}
                            onChange={(e) =>
                              setSubNotesMap((prev) => ({ ...prev, [sub.id]: e.target.value }))
                            }
                            style={{ maxWidth: "240px", padding: "0.38rem 0.65rem", fontSize: "0.8rem" }}
                          />

                          <button
                            type="button"
                            disabled={submittingPacketId === sub.id || sub.questionCount === 0}
                            onClick={() => handleSubmitPacketForReview(sub.id)}
                            className="btn btn-primary"
                            style={{ fontSize: "0.78rem", padding: "0.38rem 0.85rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            <FiSend />
                            {submittingPacketId === sub.id
                              ? "Submitting..."
                              : sub.status === "REVISION_REQUESTED"
                              ? "Resubmit Revised Packet"
                              : "Submit Packet for Exam Officer Review"}
                          </button>
                        </>
                      )}

                      {sub.status === "APPROVED" && (
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--status-success-text)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                          <FiCheckCircle /> Approved &amp; Sealed — Examination Officer can issue Morning Room Code.
                        </span>
                      )}
                    </div>

                    {sub.revisions && sub.revisions.length > 0 && (
                      <div style={{ marginTop: "0.75rem", paddingTop: "0.65rem", borderTop: "1px dashed var(--border-subtle)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        <strong>Recent History:</strong>{" "}
                        {sub.revisions
                          .slice(0, 3)
                          .map(
                            (r: any) =>
                              `Rev #${r.revisionNo} (${r.action} · ${r.questionCount} Qs · ${new Date(r.createdAt).toLocaleString()})`
                          )
                          .join(" | ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PANEL 1: HANDWRITTEN SHEET / DOCUMENT SCANNER -> EXAM BANK            */}
      {/* ===================================================================== */}
      {studioSection === "scanner" && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <form onSubmit={handleScanDocument} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>
                  Subject Pool *
                </label>
                <select
                  className="form-input"
                  value={scanSubjectCode}
                  onChange={(e) => setScanSubjectCode(e.target.value)}
                >
                  {ALL_CBT_SUBJECTS.map((code) => (
                    <option key={code} value={code}>
                      {formatCbtSubjectLabel(code)} (
                      {bankSummaryMap[code]?.examOnlyCount || 0} Exam Qs)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>
                  Target Bank Isolation *
                </label>
                <select
                  className="form-input"
                  value={scanBankScope}
                  onChange={(e) => setScanBankScope(e.target.value as "EXAM_ONLY" | "OPEN_BANK")}
                >
                  <option value="EXAM_ONLY">
                    EXAM_ONLY (Confidential — Hidden from Student Practice)
                  </option>
                  <option value="OPEN_BANK">
                    OPEN_BANK (Available in Student Practice &amp; Mock)
                  </option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>
                  Default Topic / Class Tag
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={scanTopic}
                  onChange={(e) => setScanTopic(e.target.value)}
                  placeholder="e.g., First Term Objectives"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setScanInputMode("file")}
                className={scanInputMode === "file" ? "btn btn-primary" : "btn btn-outline"}
                style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
              >
                <FiCamera style={{ marginRight: "0.35rem" }} /> Snap Photo / Upload Handwritten Sheet or PDF
              </button>
              <button
                type="button"
                onClick={() => setScanInputMode("text")}
                className={scanInputMode === "text" ? "btn btn-primary" : "btn btn-outline"}
                style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
              >
                <FiFileText style={{ marginRight: "0.35rem" }} /> Paste Typed Questions (Word / Text)
              </button>
            </div>

            {scanInputMode === "file" ? (
              <div
                style={{
                  border: "2px dashed var(--border-primary)",
                  borderRadius: "10px",
                  padding: "1.25rem",
                  background: "var(--bg-secondary)",
                }}
              >
                <label className="form-label" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  Select Handwritten Photo (JPG, PNG, WEBP) or Question Paper PDF (Max 6MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
                  capture="environment"
                  onChange={(e) => setScanFile(e.target.files?.[0] || null)}
                  style={{ width: "100%", marginTop: "0.35rem" }}
                />
                {scanFile && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--status-success-text)", fontWeight: 700 }}>
                    Ready to scan: {scanFile.name} ({Math.round(scanFile.size / 1024)} KB)
                  </div>
                )}
              </div>
            ) : (
              <div>
                <textarea
                  rows={6}
                  className="form-input"
                  value={scanRawText}
                  onChange={(e) => setScanRawText(e.target.value)}
                  placeholder={`Example:\n1. What is the SI unit of Force?\nA) Joule\nB) Newton\nC) Watt\nD) Pascal\nAnswer: B`}
                  style={{ fontFamily: "monospace", fontSize: "0.84rem" }}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Tip: Questions saved to <strong>EXAM_ONLY</strong> cannot be seen by students in Practice/Mock drills.
              </span>
              <button
                type="submit"
                disabled={scanningDoc}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
              >
                <FiUploadCloud /> {scanningDoc ? "Scanning & Digitizing..." : "Scan & Preview Questions"}
              </button>
            </div>
          </form>

          {/* Staged Teacher Review Queue */}
          {stagedDrafts.length > 0 && (
            <div style={{ marginTop: "1.75rem", borderTop: "2px solid var(--border-primary)", paddingTop: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--color-navy-blue)" }}>
                    Teacher Verification &amp; Edit Queue ({stagedDrafts.filter((d) => d.selected).length} selected)
                  </h3>
                  <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Verify OCR text and answer keys carefully before saving to the question bank.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    className="form-input"
                    value={scanClassLevel}
                    onChange={(e) => setScanClassLevel(e.target.value)}
                    placeholder="Class Level (e.g. JSS 2)"
                    style={{ width: "160px", padding: "0.45rem 0.6rem", fontSize: "0.8rem" }}
                  />
                  <select
                    className="form-input"
                    value={activeSubmissionId}
                    onChange={(e) => setActiveSubmissionId(e.target.value)}
                    style={{ maxWidth: "250px", padding: "0.45rem 0.6rem", fontSize: "0.8rem" }}
                  >
                    <option value="">Attach to Active Packet (Optional)</option>
                    {submissions
                      .filter((s) => s.status === "DRAFT" || s.status === "REVISION_REQUESTED")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          Packet: {s.title}
                        </option>
                      ))}
                  </select>
                  <select
                    className="form-input"
                    value={attachToExamId}
                    onChange={(e) => setAttachToExamId(e.target.value)}
                    style={{ maxWidth: "240px", padding: "0.45rem 0.6rem", fontSize: "0.8rem" }}
                  >
                    <option value="">Save to Bank Only (Recommended)</option>
                    {scheduledExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        Also Pin to: {ex.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleCommitScannedDrafts}
                    disabled={savingScannedBatch}
                    className="btn btn-primary"
                    style={{ fontSize: "0.84rem" }}
                  >
                    <FiCheckCircle style={{ marginRight: "0.35rem" }} />
                    {savingScannedBatch
                      ? "Saving..."
                      : `Save ${stagedDrafts.filter((d) => d.selected).length} to ${scanBankScope}`}
                  </button>
                </div>
              </div>

              {scanWarnings.length > 0 && (
                <div
                  style={{
                    background: "var(--status-warning-bg)",
                    color: "var(--status-warning-text)",
                    border: "1px solid var(--status-warning-border)",
                    borderRadius: "8px",
                    padding: "0.65rem 0.85rem",
                    fontSize: "0.82rem",
                    marginBottom: "1rem",
                    fontWeight: 600,
                  }}
                >
                  {scanWarnings.join(" ")}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {stagedDrafts.map((item, idx) => (
                  <div
                    key={item.tempId}
                    style={{
                      border: `1px solid ${item.answerConfidence === "EXPLICIT" ? "var(--border-primary)" : "var(--status-warning-border)"}`,
                      borderRadius: "10px",
                      padding: "1rem",
                      background: item.selected ? "var(--bg-secondary)" : "var(--bg-card)",
                      opacity: item.selected ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 800, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) =>
                            setStagedDrafts((prev) =>
                              prev.map((row) =>
                                row.tempId === item.tempId ? { ...row, selected: e.target.checked } : row
                              )
                            )
                          }
                        />
                        Question #{idx + 1}
                      </label>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span
                          style={{
                            padding: "0.18rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background:
                              item.answerConfidence === "EXPLICIT"
                                ? "var(--status-success-bg)"
                                : "var(--status-warning-bg)",
                            color:
                              item.answerConfidence === "EXPLICIT"
                                ? "var(--status-success-text)"
                                : "var(--status-warning-text)",
                          }}
                        >
                          {item.answerConfidence === "EXPLICIT"
                            ? "Marked Answer Detected"
                            : "Verify Answer Key"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setStagedDrafts((prev) => prev.filter((row) => row.tempId !== item.tempId))
                          }
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--status-error-text)",
                            cursor: "pointer",
                          }}
                          title="Discard Question"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      className="form-input"
                      value={item.stem}
                      onChange={(e) =>
                        setStagedDrafts((prev) =>
                          prev.map((row) =>
                            row.tempId === item.tempId ? { ...row, stem: e.target.value } : row
                          )
                        )
                      }
                      style={{ marginBottom: "0.6rem", fontSize: "0.86rem" }}
                    />

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.5rem", marginBottom: "0.6rem" }}>
                      {(["A", "B", "C", "D"] as const).map((letter) => {
                        const fieldKey = `option${letter}` as "optionA" | "optionB" | "optionC" | "optionD";
                        return (
                          <div key={letter} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <strong style={{ fontSize: "0.8rem" }}>{letter}:</strong>
                            <input
                              type="text"
                              className="form-input"
                              value={item[fieldKey]}
                              onChange={(e) =>
                                setStagedDrafts((prev) =>
                                  prev.map((row) =>
                                    row.tempId === item.tempId
                                      ? { ...row, [fieldKey]: e.target.value }
                                      : row
                                  )
                                )
                              }
                              style={{ padding: "0.38rem 0.55rem", fontSize: "0.82rem" }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "0.6rem" }}>
                      <select
                        className="form-input"
                        value={item.correctKey}
                        onChange={(e) =>
                          setStagedDrafts((prev) =>
                            prev.map((row) =>
                              row.tempId === item.tempId
                                ? {
                                    ...row,
                                    correctKey: e.target.value as "a" | "b" | "c" | "d",
                                    answerConfidence: "EXPLICIT",
                                  }
                                : row
                            )
                          )
                        }
                        style={{ padding: "0.4rem", fontSize: "0.82rem", fontWeight: 700 }}
                      >
                        <option value="a">Ans: Option A</option>
                        <option value="b">Ans: Option B</option>
                        <option value="c">Ans: Option C</option>
                        <option value="d">Ans: Option D</option>
                      </select>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Optional marking guide / explanation..."
                        value={item.explanation}
                        onChange={(e) =>
                          setStagedDrafts((prev) =>
                            prev.map((row) =>
                              row.tempId === item.tempId ? { ...row, explanation: e.target.value } : row
                            )
                          )
                        }
                        style={{ padding: "0.4rem 0.6rem", fontSize: "0.82rem" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PANEL 2: STRICT EXAM SCHEDULER, INVIGILATOR MONITOR & SCORE SYNC       */}
      {/* ===================================================================== */}
      {studioSection === "scheduler" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "1.25rem", alignItems: "start" }}>
          {/* Schedule / Configure Form */}
          <form
            onSubmit={handleSaveScheduledExam}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-lg)",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "var(--color-navy-blue)", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <FiSliders /> {editingExamId ? "Edit Strict CBT Exam" : "Schedule Official Strict Exam"}
              </h3>
              {editingExamId && (
                <button type="button" onClick={resetExamForm} className="btn btn-outline" style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}>
                  Cancel Edit
                </button>
              )}
            </div>

            <div>
              <label className="form-label" style={{ fontSize: "0.8rem" }}>
                Class &amp; Subject Allocation *
              </label>
              <select
                className="form-input"
                value={exAllocKey}
                onChange={(e) => handleAllocSelect(e.target.value)}
                required
              >
                <option value="">-- Select Class & Subject --</option>
                {allocations.map((a) => (
                  <option key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>
                    {a.className} — {a.subjectName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: "0.8rem" }}>
                Official Exam Title *
              </label>
              <input
                type="text"
                className="form-input"
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
                placeholder="e.g., First Term Mathematics Terminal CBT"
                required
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>
                  Exam Bank Subject Code *
                </label>
                <select
                  className="form-input"
                  value={exSubjectCode}
                  onChange={(e) => setExSubjectCode(e.target.value)}
                >
                  {ALL_CBT_SUBJECTS.map((code) => (
                    <option key={code} value={code}>
                      {formatCbtSubjectLabel(code)} ({bankSummaryMap[code]?.examOnlyCount || 0} Qs)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>
                  Assessment Type
                </label>
                <select
                  className="form-input"
                  value={exType}
                  onChange={(e) => setExType(e.target.value as "CA_TEST" | "MIDTERM" | "TERMINAL_EXAM")}
                >
                  <option value="CA_TEST">CA Test (Continuous Assessment)</option>
                  <option value="MIDTERM">Midterm CBT Examination</option>
                  <option value="TERMINAL_EXAM">End-of-Term Examination</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: "0.78rem", padding: "0.55rem 0.75rem", borderRadius: "8px", background: activeSubjectBankCount >= exQuestionCount ? "var(--status-success-bg)" : "var(--status-warning-bg)", color: activeSubjectBankCount >= exQuestionCount ? "var(--status-success-text)" : "var(--status-warning-text)", fontWeight: 600 }}>
              Confidential <strong>EXAM-ONLY</strong> Pool for {formatCbtSubjectLabel(exSubjectCode)}: <strong>{activeSubjectBankCount}</strong> question(s) ready
              {pinnedQuestionIds.length > 0 ? ` · (${pinnedQuestionIds.length} manually pinned)` : ""}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.65rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Questions / Student
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="form-input"
                  value={exQuestionCount}
                  onChange={(e) => setExQuestionCount(Math.max(1, parseInt(e.target.value || "20", 10)))}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Duration (Mins)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  className="form-input"
                  value={exDurationMin}
                  onChange={(e) => setExDurationMin(Math.max(5, parseInt(e.target.value || "30", 10)))}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Strict Strike Policy
                </label>
                <select
                  className="form-input"
                  value={exMaxStrikes}
                  onChange={(e) => setExMaxStrikes(Number(e.target.value) === 1 ? 1 : 2)}
                >
                  <option value={2}>2 Strikes (Warn then Lock)</option>
                  <option value={1}>1 Strike (Instant Lock)</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Invigilator PIN (Optional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={exAccessCode}
                  onChange={(e) => setExAccessCode(e.target.value)}
                  placeholder="e.g. MATH2026 (min 4 chars)"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.78rem" }}>
                  Launch Status
                </label>
                <select
                  className="form-input"
                  value={exStatus}
                  onChange={(e) => setExStatus(e.target.value as "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED")}
                >
                  <option value="DRAFT">Draft (Hidden)</option>
                  <option value="SCHEDULED">Scheduled (Awaiting Room Activation)</option>
                  <option value="LIVE" disabled={mode === "teacher"}>
                    {mode === "teacher"
                      ? "LIVE NOW (Exam Officer / VP Room Code Activation Required)"
                      : "LIVE NOW (Students Can Take)"}
                  </option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.75rem" }}>
                  Opens At (Optional Window)
                </label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={exStartsAt}
                  onChange={(e) => setExStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: "0.75rem" }}>
                  Closes At (Optional Window)
                </label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={exEndsAt}
                  onChange={(e) => setExEndsAt(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.82rem", padding: "0.65rem", borderRadius: "8px", background: "var(--bg-secondary)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
                <input type="checkbox" checked={exStrictMode} onChange={(e) => setExStrictMode(e.target.checked)} />
                Enforce Exam Strict Mode (Fullscreen Gate, Tab-Lock, Copy/Paste &amp; PrintScreen Block)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={exRequireFeeClearance}
                  onChange={(e) => setExRequireFeeClearance(e.target.checked)}
                />
                Enforce Term Fee Clearance Gate (Registered Students Must Have Cleared Term Fees)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600 }}>
                <input type="checkbox" checked={exRevealScore} onChange={(e) => setExRevealScore(e.target.checked)} />
                Show Numeric Score Immediately Upon Submission (Solutions Stay Locked Until Released)
              </label>
              {editingExamId && (
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={exClearPin} onChange={(e) => setExClearPin(e.target.checked)} />
                  Remove Existing Invigilator PIN
                </label>
              )}
            </div>

            <button type="submit" disabled={savingExam} className="btn btn-primary" style={{ justifyContent: "center" }}>
              <FiPlus style={{ marginRight: "0.35rem" }} />
              {savingExam ? "Saving..." : editingExamId ? "Save Strict Exam Changes" : "Save & Publish Strict CBT Exam"}
            </button>
          </form>

          {/* Scheduled Exams Control List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {scheduledExams.length === 0 ? (
              <div style={{ background: "var(--bg-card)", border: "1px dashed var(--border-primary)", borderRadius: "var(--radius-lg)", padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                No scheduled strict exams yet. Configure and save your first exam on the left.
              </div>
            ) : (
              scheduledExams.map((ex) => {
                const isLive = ex.status === "LIVE";
                return (
                  <div
                    key={ex.id}
                    style={{
                      background: "var(--bg-card)",
                      border: `1px solid ${isLive ? "var(--status-success-border)" : "var(--border-primary)"}`,
                      borderRadius: "var(--radius-lg)",
                      padding: "1.1rem 1.25rem",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.25rem" }}>
                          <span
                            style={{
                              padding: "0.18rem 0.55rem",
                              borderRadius: "999px",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              background:
                                ex.status === "LIVE"
                                  ? "var(--status-success-bg)"
                                  : ex.status === "SCHEDULED"
                                  ? "var(--status-info-bg)"
                                  : "var(--bg-secondary)",
                              color:
                                ex.status === "LIVE"
                                  ? "var(--status-success-text)"
                                  : ex.status === "SCHEDULED"
                                  ? "var(--status-info-text)"
                                  : "var(--text-secondary)",
                            }}
                          >
                            {ex.status === "LIVE" ? "LIVE NOW" : ex.status}
                          </span>
                          <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                            {ex.className} · {ex.subjectName}
                          </span>
                          {(ex.requireAccessCode || ex.activeRoomCodePreview) && (
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "999px", background: "var(--status-warning-bg)", color: "var(--status-warning-text)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                              <FiKey /> {ex.activeRoomCodePreview ? `Room Code: ${ex.activeRoomCodePreview}` : "PIN Protected"}
                            </span>
                          )}
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "999px", background: ex.requireFeeClearance ? "var(--status-info-bg)" : "var(--bg-secondary)", color: ex.requireFeeClearance ? "var(--status-info-text)" : "var(--text-secondary)" }}>
                            {ex.requireFeeClearance ? "Fee Cleared Only" : "Fee Check Waived"}
                          </span>
                          {ex.submissionStatus && (
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "999px", background: ex.submissionStatus === "APPROVED" ? "var(--status-success-bg)" : "var(--bg-secondary)", color: ex.submissionStatus === "APPROVED" ? "var(--status-success-text)" : "var(--text-secondary)" }}>
                              Packet: {ex.submissionStatus}
                            </span>
                          )}
                        </div>
                        <h4 style={{ margin: 0, color: "var(--text-heading)", fontSize: "1rem" }}>{ex.title}</h4>
                      </div>

                      <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", textAlign: "right" }}>
                        <div><FiClock style={{ verticalAlign: "middle" }} /> {ex.questionCount} Qs · {ex.durationMinutes} mins</div>
                        <div>{ex.strictMode ? `Strict (${ex.maxStrikes}-strike lock)` : "Standard Mode"}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.85rem" }}>
                      <span>Active: <strong>{ex.activeCount}</strong></span>
                      <span>Submitted: <strong>{ex.submittedCount}</strong></span>
                      <span style={{ color: ex.terminatedCount > 0 ? "var(--status-error-text)" : undefined }}>
                        Terminated: <strong>{ex.terminatedCount}</strong>
                      </span>
                      <span>
                        Solutions: <strong>{ex.answersReleased ? "Released" : "Held Confidential"}</strong>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                      {ex.status !== "LIVE" ? (
                        mode === "admin" ? (
                          <button
                            type="button"
                            onClick={() => handleExamLifecycle(ex.id, { status: "LIVE" })}
                            className="btn btn-primary"
                            style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            <FiPlay /> Go Live Now
                          </button>
                        ) : (
                          <span
                            style={{
                              padding: "0.35rem 0.7rem",
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              borderRadius: "8px",
                              background: "var(--bg-secondary)",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border-primary)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                            }}
                          >
                            <FiLock /> Requires Exam Officer Activation
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleExamLifecycle(ex.id, { status: "CLOSED" })}
                          className="btn btn-outline"
                          style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", color: "var(--status-error-text)", borderColor: "var(--status-error-border)" }}
                        >
                          Close Exam Window
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenMonitor(ex.id)}
                        className="btn btn-outline"
                        style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <FiEye /> Live Monitor
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleExamLifecycle(ex.id, { answersReleased: !ex.answersReleased })
                        }
                        className="btn btn-outline"
                        style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}
                      >
                        {ex.answersReleased ? "Lock Solutions" : "Release Answers & AI Review"}
                      </button>

                      {onApplyScoresToResultGrid && ex.subjectId && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenSyncPreview(
                                ex,
                                ex.examType === "TERMINAL_EXAM" ? "exam" : "ca",
                                ex.examType === "TERMINAL_EXAM" ? 60 : 20
                              )
                            }
                            className="btn btn-outline"
                            style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem", color: "var(--status-success-text)", borderColor: "var(--status-success-border)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            <FiAward /> Sync Scores -&gt; Result Sheet
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PANEL 3: SUBJECT QUESTION BANK BROWSER & PINNER                       */}
      {/* ===================================================================== */}
      {studioSection === "bank" && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-lg)",
            padding: "1.4rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <select
                className="form-input"
                value={bankScopeFilter}
                onChange={(e) => setBankScopeFilter(e.target.value as "ALL" | "EXAM_ONLY" | "OPEN_BANK")}
                style={{ width: "auto", padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}
              >
                <option value="EXAM_ONLY">Confidential EXAM_ONLY Bank</option>
                <option value="OPEN_BANK">Student Practice OPEN_BANK</option>
                <option value="ALL">All Scopes</option>
              </select>
              <select
                className="form-input"
                value={bankSubjectFilter}
                onChange={(e) => setBankSubjectFilter(e.target.value)}
                style={{ width: "auto", padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}
              >
                <option value="all">All Subjects</option>
                {ALL_CBT_SUBJECTS.map((code) => (
                  <option key={code} value={code}>
                    {formatCbtSubjectLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            {pinnedQuestionIds.length > 0 && (
              <button
                type="button"
                onClick={() => setStudioSection("scheduler")}
                className="btn btn-primary"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
              >
                Use {pinnedQuestionIds.length} Pinned Question(s) in Exam Scheduler
              </button>
            )}
          </div>

          {bankQuestions.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
              No questions found in this filter. Scan a handwritten paper or PDF in Tab 1 to populate your Exam Bank.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "480px", overflowY: "auto" }}>
              {bankQuestions.map((q) => {
                const isPinned = pinnedQuestionIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    style={{
                      border: `1px solid ${isPinned ? "var(--color-primary-green)" : "var(--border-primary)"}`,
                      borderRadius: "8px",
                      padding: "0.85rem 1rem",
                      background: "var(--bg-secondary)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 800, padding: "0.15rem 0.5rem", borderRadius: "999px", background: q.bankScope === "EXAM_ONLY" ? "var(--status-error-bg)" : "var(--status-success-bg)", color: q.bankScope === "EXAM_ONLY" ? "var(--status-error-text)" : "var(--status-success-text)" }}>
                          {q.bankScope}
                        </span>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                          {formatCbtSubjectLabel(q.subjectCode)} · {q.topic} · Ans: {q.correctKey.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          onClick={() =>
                            setPinnedQuestionIds((prev) =>
                              prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                            )
                          }
                          className={isPinned ? "btn btn-primary" : "btn btn-outline"}
                          style={{ padding: "0.25rem 0.55rem", fontSize: "0.74rem" }}
                        >
                          {isPinned ? "Pinned ✓" : "Pin to Exam"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await toggleSchoolCbtQuestionActive(q.id, false);
                            await loadStudio();
                          }}
                          className="btn btn-outline"
                          style={{ padding: "0.25rem 0.55rem", fontSize: "0.74rem", color: "var(--status-error-text)" }}
                        >
                          <FiArchive />
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-heading)" }}>{q.stem}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* LIVE EXAM INVIGILATOR MONITOR MODAL                                   */}
      {/* ===================================================================== */}
      {(monitorData || loadingMonitor) && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card" style={{ maxWidth: "860px", width: "95%", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
                  Live Invigilator Hall: {monitorData?.exam?.title || "Loading..."}
                </h3>
                {monitorData?.exam && (
                  <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    {monitorData.exam.className} · {monitorData.exam.subjectName} · Status: <strong>{monitorData.exam.status}</strong>
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {monitorData?.exam?.id && (
                  <button type="button" onClick={() => handleOpenMonitor(monitorData.exam.id)} className="btn btn-outline" style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}>
                    <FiRefreshCw /> Refresh
                  </button>
                )}
                <button type="button" onClick={() => setMonitorData(null)} className="btn btn-outline" style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}>
                  Close
                </button>
              </div>
            </div>

            {loadingMonitor ? (
              <div style={{ padding: "2rem", textAlign: "center" }}>Loading examinees...</div>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: "420px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-primary)" }}>
                      <th style={{ padding: "0.55rem", textAlign: "left" }}>Student</th>
                      <th style={{ padding: "0.55rem", textAlign: "center" }}>Status</th>
                      <th style={{ padding: "0.55rem", textAlign: "center" }}>Strikes</th>
                      <th style={{ padding: "0.55rem", textAlign: "center" }}>Score</th>
                      <th style={{ padding: "0.55rem", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(monitorData?.rows || []).map((r: any) => (
                      <tr key={r.studentId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "0.55rem" }}>
                          <div style={{ fontWeight: 700 }}>{r.studentName}</div>
                          <div style={{ fontSize: "0.74rem", fontFamily: "monospace", color: "var(--text-muted)" }}>{r.admissionNo}</div>
                        </td>
                        <td style={{ padding: "0.55rem", textAlign: "center", fontWeight: 700 }}>{r.status}</td>
                        <td style={{ padding: "0.55rem", textAlign: "center", color: r.hardStrikes > 0 ? "var(--status-error-text)" : undefined }}>
                          {r.hardStrikes}
                        </td>
                        <td style={{ padding: "0.55rem", textAlign: "center", fontWeight: 700 }}>
                          {r.scorePct !== null ? `${r.scorePct}%` : "—"}
                        </td>
                        <td style={{ padding: "0.55rem", textAlign: "right" }}>
                          {r.attemptId && (r.status === "TERMINATED" || r.status === "EXPIRED" || r.status === "SUBMITTED") && (
                            <button
                              type="button"
                              onClick={() => handleGrantRetake(r.attemptId, r.studentName)}
                              className="btn btn-outline"
                              style={{ padding: "0.25rem 0.55rem", fontSize: "0.74rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            >
                              <FiUnlock /> Allow Retake
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
        </div>
      )}

      {/* ===================================================================== */}
      {/* SCORE SYNC TO CA / EXAM MODAL                                         */}
      {/* ===================================================================== */}
      {syncPreview && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card" style={{ maxWidth: "740px", width: "95%", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
              <div>
                <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
                  Sync Strict Exam Scores -&gt; Result Sheet ({syncPreview.exam.title})
                </h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {syncPreview.data.matchedCount} of {syncPreview.data.totalStudents} student(s) completed this exam.
                </p>
              </div>
              <button type="button" onClick={() => setSyncPreview(null)} className="btn btn-outline" style={{ fontSize: "0.78rem" }}>
                Close
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
              <select
                className="form-input"
                style={{ width: "auto" }}
                value={`${syncPreview.targetColumn}:${syncPreview.maxWeight}`}
                onChange={(e) => {
                  const [col, w] = e.target.value.split(":");
                  handleOpenSyncPreview(syncPreview.exam, col as "ca" | "exam", parseInt(w, 10));
                }}
              >
                <option value="ca:10">Populate CA Score (Out of 10 Marks)</option>
                <option value="ca:20">Populate CA Score (Out of 20 Marks)</option>
                <option value="ca:30">Populate CA Score (Out of 30 Marks)</option>
                <option value="ca:40">Populate CA Score (Out of 40 Full CA)</option>
                <option value="exam:40">Populate Exam Score (Out of 40 Obj)</option>
                <option value="exam:60">Populate Exam Score (Out of 60 Full Exam)</option>
              </select>
            </div>

            <div style={{ overflowX: "auto", maxHeight: "300px", marginBottom: "1rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-primary)" }}>
                    <th style={{ padding: "0.5rem", textAlign: "left" }}>Student</th>
                    <th style={{ padding: "0.5rem", textAlign: "center" }}>CBT %</th>
                    <th style={{ padding: "0.5rem", textAlign: "center" }}>
                      Scaled {syncPreview.targetColumn.toUpperCase()} (/{syncPreview.maxWeight})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(syncPreview.data.items || []).map((item: any) => (
                    <tr key={item.studentId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.5rem" }}>
                        <strong>{item.studentName}</strong> ({item.admissionNo})
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center" }}>
                        {item.hasAttempt ? `${item.scorePercent}%` : "No attempt"}
                      </td>
                      <td style={{ padding: "0.5rem", textAlign: "center", fontWeight: 800, color: item.hasAttempt ? "var(--status-success-text)" : "var(--text-muted)" }}>
                        {item.scaledScore !== null ? item.scaledScore : "Unchanged"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button type="button" onClick={() => setSyncPreview(null)} className="btn btn-outline">
                Cancel
              </button>
              <button
                type="button"
                disabled={!onApplyScoresToResultGrid || syncPreview.data.matchedCount === 0}
                onClick={() => {
                  if (onApplyScoresToResultGrid) {
                    onApplyScoresToResultGrid({
                      classId: syncPreview.data.classId,
                      subjectId: syncPreview.data.subjectId,
                      targetColumn: syncPreview.targetColumn,
                      maxWeight: syncPreview.maxWeight,
                      items: syncPreview.data.items,
                      examTitle: syncPreview.exam.title,
                    });
                    setSyncPreview(null);
                  }
                }}
                className="btn btn-primary"
              >
                Apply {syncPreview.data.matchedCount} Score(s) to Subject Score Grid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
