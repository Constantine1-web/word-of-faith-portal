"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getExamUploadProgressDashboard,
  inspectQuestionSubmissionForReview,
  decideQuestionSubmissionReview,
  sendSubmissionReminderToTeacher,
} from "@/app/actions/cbtSubmissions";
import {
  getAdminScheduledExamsDashboard,
  generateExamRoomCodeAction,
  batchGenerateMorningRoomCodesAction,
  revokeExamRoomCodeAction,
  updateScheduledExamStatus,
} from "@/app/actions/cbtExams";
import ExamBankAndSchedulerStudio from "@/components/cbt/ExamBankAndSchedulerStudio";
import {
  FiShield,
  FiCheckCircle,
  FiAlertTriangle,
  FiKey,
  FiLock,
  FiRefreshCw,
  FiEye,
  FiBell,
  FiClock,
  FiPlay,
  FiXCircle,
  FiPrinter,
  FiSliders,
} from "react-icons/fi";

interface GeneratedCodeSlipItem {
  examId: string;
  examTitle: string;
  className: string;
  subjectName: string;
  plainCode: string;
  codePreview: string;
  expiresAt: string;
}

export default function ExaminationControlCentre() {
  const [subTab, setSubTab] = useState<"progress" | "codes" | "studio">("progress");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Progress Dashboard & Priority Timeline State
  const [examTypeFilter, setExamTypeFilter] = useState<string>("TERMINAL_EXAM");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [classFilter, setClassFilter] = useState<string>("ALL");
  const [termLabel, setTermLabel] = useState("");
  const [kpis, setKpis] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [remindingKey, setRemindingKey] = useState<string | null>(null);

  // Submission Inspection & Approval Modal State
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspectedSubmission, setInspectedSubmission] = useState<any | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [reviewDurationMin, setReviewDurationMin] = useState(30);
  const [reviewRequireFeeClearance, setReviewRequireFeeClearance] = useState(true);
  const [deciding, setDeciding] = useState(false);

  // Morning Room Code Manager State
  const [scheduledExams, setScheduledExams] = useState<any[]>([]);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [codeValidMinutes, setCodeValidMinutes] = useState(180);
  const [generatingCodeId, setGeneratingCodeId] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [issuedCodeSlips, setIssuedCodeSlips] = useState<GeneratedCodeSlipItem[]>([]);

  const fetchDashboardSnapshot = useCallback(async (targetExamType: string) => {
    const [progressRes, roomsRes] = await Promise.all([
      getExamUploadProgressDashboard({ examType: targetExamType }),
      getAdminScheduledExamsDashboard(),
    ]);
    return { progressRes, roomsRes };
  }, []);

  const applyDashboardSnapshot = useCallback(
    ({
      progressRes,
      roomsRes,
    }: Awaited<ReturnType<typeof fetchDashboardSnapshot>>) => {
      if (progressRes.success) {
        setTermLabel(progressRes.termLabel || "");
        setKpis(progressRes.kpis || null);
        setTimeline(progressRes.timeline || []);
      } else if (progressRes.error) {
        setError(progressRes.error);
      }

      if (roomsRes.success) {
        setScheduledExams(roomsRes.exams || []);
      }
      setLoading(false);
    },
    []
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const snap = await fetchDashboardSnapshot(examTypeFilter);
    applyDashboardSnapshot(snap);
  }, [fetchDashboardSnapshot, applyDashboardSnapshot, examTypeFilter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await fetchDashboardSnapshot(examTypeFilter);
      if (!cancelled) {
        applyDashboardSnapshot(snap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchDashboardSnapshot, applyDashboardSnapshot, examTypeFilter]);

  const handleOpenInspect = async (submissionId: string) => {
    setError("");
    setInspectingId(submissionId);
    setReviewerNotes("");
    const res = await inspectQuestionSubmissionForReview(submissionId);
    setInspectingId(null);
    if (res.success && res.submission) {
      setInspectedSubmission(res.submission);
      setReviewerNotes(res.submission.reviewerNotes || "");
    } else {
      setError(res.error || "Unable to open submission packet.");
    }
  };

  const handleDecision = async (decision: "APPROVE" | "REQUEST_REVISION" | "REJECT") => {
    if (!inspectedSubmission) return;
    setError("");
    setSuccess("");
    setDeciding(true);
    const res = await decideQuestionSubmissionReview({
      submissionId: inspectedSubmission.id,
      decision,
      reviewerNotes,
      durationMinutes: reviewDurationMin,
      requireFeeClearance: reviewRequireFeeClearance,
    });
    setDeciding(false);

    if (res.success) {
      setSuccess(
        decision === "APPROVE"
          ? `Approved "${inspectedSubmission.title}" and provisioned its Subject Examination Room.`
          : `Submission marked ${res.status?.replace(/_/g, " ")}. Teacher notified.`
      );
      setInspectedSubmission(null);
      await refreshAll();
    } else {
      setError(res.error || "Failed to record decision.");
    }
  };

  const handleSendReminder = async (row: any) => {
    const key = `${row.teacherId}:${row.classId}:${row.subjectId}`;
    setRemindingKey(key);
    setError("");
    const res = await sendSubmissionReminderToTeacher({
      teacherId: row.teacherId,
      className: row.className,
      subjectName: row.subjectName,
      examType: row.examType,
    });
    setRemindingKey(null);
    if (res.success) {
      setSuccess(`Reminder dispatched to ${row.teacherEmail} for ${row.className} ${row.subjectName}.`);
    } else {
      setError(res.error || "Could not dispatch reminder.");
    }
  };

  const handleGenerateSingleCode = async (examId: string) => {
    setError("");
    setSuccess("");
    setGeneratingCodeId(examId);
    const res = await generateExamRoomCodeAction({
      scheduledExamId: examId,
      validForMinutes: codeValidMinutes,
      autoOpenRoom: true,
    });
    setGeneratingCodeId(null);

    if (res.success && res.plainCode) {
      setIssuedCodeSlips((prev) => [
        {
          examId: res.examId!,
          examTitle: res.examTitle!,
          className: res.className!,
          subjectName: res.subjectName!,
          plainCode: res.plainCode!,
          codePreview: res.codePreview!,
          expiresAt: res.expiresAt!,
        },
        ...prev.filter((item) => item.examId !== res.examId),
      ]);
      setSuccess(`Morning Room Code ${res.plainCode} generated for ${res.subjectName} (${res.className}) — Room is now LIVE.`);
      await refreshAll();
    } else {
      setError(res.error || "Failed to generate room code.");
    }
  };

  const handleBatchGenerateCodes = async () => {
    if (selectedExamIds.length === 0) {
      setError("Check at least one examination below to batch-generate morning room codes.");
      return;
    }
    setError("");
    setSuccess("");
    setBatchGenerating(true);
    const res = await batchGenerateMorningRoomCodesAction({
      examIds: selectedExamIds,
      validForMinutes: codeValidMinutes,
      autoOpenRooms: true,
    });
    setBatchGenerating(false);

    if (res.success && res.generated) {
      setIssuedCodeSlips((prev) => {
        const nextIds = new Set(res.generated.map((g) => g.examId));
        return [...res.generated, ...prev.filter((p) => !nextIds.has(p.examId))];
      });
      setSelectedExamIds([]);
      setSuccess(`Generated ${res.generatedCount} subject-bound Morning Room Code(s) and opened rooms.`);
      await refreshAll();
    } else {
      setError(res.error || "Batch generation failed.");
    }
  };

  const handleRevokeCode = async (examId: string, title: string) => {
    const reason = prompt(`Enter reason for revoking/deactivating the room code for "${title}":`);
    if (!reason || reason.trim().length < 3) return;
    const res = await revokeExamRoomCodeAction({ scheduledExamId: examId, reason: reason.trim() });
    if (res.success) {
      setIssuedCodeSlips((prev) => prev.filter((item) => item.examId !== examId));
      setSuccess(`Room code revoked for "${title}".`);
      await refreshAll();
    } else {
      setError(res.error || "Failed to revoke code.");
    }
  };

  const distinctClasses = Array.from(new Set(timeline.map((r) => r.className))).sort();
  const filteredTimeline = timeline.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (classFilter !== "ALL" && r.className !== classFilter) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header Strip */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A2540, #1E3A8A)",
          borderRadius: "var(--radius-lg)",
          padding: "1.4rem 1.6rem",
          color: "#FFFFFF",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#4ade80", letterSpacing: "0.05em" }}>
            Single-Tier Exam Officer / Vice Principal Governance · {termLabel || "Active Term"}
          </div>
          <h2 style={{ margin: "0.25rem 0 0 0", fontSize: "1.35rem", color: "#FFFFFF" }}>
            Central Examination Control Centre
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.86rem", color: "rgba(255,255,255,0.85)" }}>
            Track every teacher&apos;s upload timeline, review &amp; approve encrypted question packets, and issue subject-bound Morning Examination Room Codes.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="btn btn-outline"
          style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.4)", fontSize: "0.82rem", padding: "0.45rem 0.85rem" }}
        >
          <FiRefreshCw style={{ marginRight: "0.35rem" }} /> Refresh Live Data
        </button>
      </div>

      {/* Sub-Tabs */}
      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setSubTab("progress")}
          className={subTab === "progress" ? "btn btn-primary" : "btn btn-outline"}
          style={{ fontSize: "0.86rem" }}
        >
          <FiClock style={{ marginRight: "0.35rem" }} /> 1. Upload Progress &amp; Review Queue
          {kpis?.awaitingReviewCount > 0 ? ` (${kpis.awaitingReviewCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setSubTab("codes")}
          className={subTab === "codes" ? "btn btn-primary" : "btn btn-outline"}
          style={{ fontSize: "0.86rem" }}
        >
          <FiKey style={{ marginRight: "0.35rem" }} /> 2. Morning Room Codes &amp; Live Control ({scheduledExams.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("studio")}
          className={subTab === "studio" ? "btn btn-primary" : "btn btn-outline"}
          style={{ fontSize: "0.86rem" }}
        >
          <FiSliders style={{ marginRight: "0.35rem" }} /> 3. Paper Scanner, Scheduler &amp; Room Monitor
        </button>
      </div>

      {error && (
        <div style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", fontWeight: 700, fontSize: "0.88rem" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "0.85rem 1rem", borderRadius: "8px", background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", fontWeight: 700, fontSize: "0.88rem" }}>
          {success}
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 1: UPLOAD PROGRESS DASHBOARD & SUBMISSION PRIORITY TIMELINE     */}
      {/* =================================================================== */}
      {subTab === "progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {kpis && (
            <>
              {/* KPI Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 165px), 1fr))", gap: "0.85rem" }}>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1rem" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Expected Subject Papers
                  </div>
                  <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-navy-blue)" }}>
                    {kpis.totalSubjectsRequired}
                  </div>
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1rem" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Submitted ({kpis.completionPct}%)
                  </div>
                  <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--status-info-text)" }}>
                    {kpis.submittedCount}
                  </div>
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1rem" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Awaiting Review
                  </div>
                  <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--status-warning-text)" }}>
                    {kpis.awaitingReviewCount}
                  </div>
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1rem" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Approved ({kpis.approvalPct}%)
                  </div>
                  <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--status-success-text)" }}>
                    {kpis.approvedCount}
                  </div>
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1rem" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Outstanding / Revision
                  </div>
                  <div style={{ fontSize: "1.65rem", fontWeight: 800, color: kpis.outstandingCount > 0 ? "var(--status-error-text)" : "var(--text-muted)" }}>
                    {kpis.outstandingCount} / {kpis.revisionOrRejectedCount}
                  </div>
                </div>
              </div>

              {/* Dual Progress Bar */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  <span>Overall Preparation Readiness</span>
                  <span>
                    {kpis.submittedCount} Submitted · {kpis.approvedCount} Approved / {kpis.totalSubjectsRequired} Total Assigned Papers
                  </span>
                </div>
                <div style={{ height: "12px", background: "var(--bg-secondary)", borderRadius: "999px", overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${kpis.approvalPct}%`, background: "#16a34a" }} title="Approved" />
                  <div style={{ width: `${Math.max(0, kpis.completionPct - kpis.approvalPct)}%`, background: "#3b82f6" }} title="Submitted / Pending Review" />
                </div>
              </div>
            </>
          )}

          {/* Filters */}
          <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "0.9rem 1.1rem" }}>
            <select className="form-input" value={examTypeFilter} onChange={(e) => setExamTypeFilter(e.target.value)} style={{ width: "auto" }}>
              <option value="TERMINAL_EXAM">End-of-Term Examination</option>
              <option value="MIDTERM">Midterm Examination</option>
              <option value="CA_TEST">Continuous Assessment (CA)</option>
            </select>
            <select className="form-input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: "auto" }}>
              <option value="ALL">All Class Arms</option>
              {distinctClasses.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto" }}>
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted (Awaiting Review)</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REVISION_REQUESTED">Revision Requested</option>
              <option value="REJECTED">Rejected</option>
              <option value="PENDING_NOT_STARTED">Not Submitted Yet</option>
            </select>
          </div>

          {/* Ranked Submission Priority Timeline */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)", textAlign: "left" }}>
                  <th style={{ padding: "0.85rem" }}>Order</th>
                  <th style={{ padding: "0.85rem" }}>Teacher</th>
                  <th style={{ padding: "0.85rem" }}>Class &amp; Subject</th>
                  <th style={{ padding: "0.85rem", textAlign: "center" }}>Questions</th>
                  <th style={{ padding: "0.85rem" }}>Initial Submission (Immutable)</th>
                  <th style={{ padding: "0.85rem" }}>Status</th>
                  <th style={{ padding: "0.85rem" }}>Reviewer</th>
                  <th style={{ padding: "0.85rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No subject teacher assignments match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredTimeline.map((row) => (
                    <tr key={`${row.teacherId}:${row.classId}:${row.subjectId}`} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.8rem", fontWeight: 800, color: row.submissionRank ? "var(--color-navy-blue)" : "var(--text-muted)" }}>
                        {row.submissionRank ? `#${row.submissionRank}` : "—"}
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        <div style={{ fontWeight: 700 }}>{row.teacherEmail}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>ID #{row.teacherId}</div>
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        <div style={{ fontWeight: 700 }}>{row.subjectName}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{row.className}</div>
                      </td>
                      <td style={{ padding: "0.8rem", textAlign: "center", fontWeight: 700 }}>
                        {row.questionCount} / {row.targetQuestionGoal}
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        {row.initialSubmittedAt ? (
                          <div>
                            <div style={{ fontWeight: 700 }}>
                              {new Date(row.initialSubmittedAt).toLocaleString("en-NG", {
                                month: "short",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              Rev #{row.revisionNumber} · Mod:{" "}
                              {new Date(row.lastModifiedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: row.isOverdue ? "var(--status-error-text)" : "var(--text-muted)", fontWeight: 600 }}>
                            {row.isOverdue ? "OVERDUE — Not Submitted" : "Not Submitted Yet"}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        <span
                          style={{
                            padding: "0.2rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            background:
                              row.status === "APPROVED"
                                ? "var(--status-success-bg)"
                                : row.status === "SUBMITTED" || row.status === "UNDER_REVIEW"
                                ? "var(--status-info-bg)"
                                : row.status === "REVISION_REQUESTED" || row.status === "REJECTED"
                                ? "var(--status-error-bg)"
                                : "var(--status-warning-bg)",
                            color:
                              row.status === "APPROVED"
                                ? "var(--status-success-text)"
                                : row.status === "SUBMITTED" || row.status === "UNDER_REVIEW"
                                ? "var(--status-info-text)"
                                : row.status === "REVISION_REQUESTED" || row.status === "REJECTED"
                                ? "var(--status-error-text)"
                                : "var(--status-warning-text)",
                          }}
                        >
                          {row.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "0.8rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                        {row.reviewerEmail || "—"}
                      </td>
                      <td style={{ padding: "0.8rem", textAlign: "right" }}>
                        {row.submissionId && row.status !== "DRAFT" && row.status !== "PENDING_NOT_STARTED" ? (
                          <button
                            type="button"
                            onClick={() => handleOpenInspect(row.submissionId)}
                            disabled={inspectingId === row.submissionId}
                            className="btn btn-primary"
                            style={{ padding: "0.35rem 0.7rem", fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            <FiEye /> {inspectingId === row.submissionId ? "Decrypting..." : "Inspect & Decide"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSendReminder(row)}
                            disabled={remindingKey === `${row.teacherId}:${row.classId}:${row.subjectId}`}
                            className="btn btn-outline"
                            style={{ padding: "0.35rem 0.7rem", fontSize: "0.76rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                          >
                            <FiBell /> Send Reminder
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 2: MORNING EXAMINATION ROOM CODE MANAGER & PRINTABLE SLIP      */}
      {/* =================================================================== */}
      {subTab === "codes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", padding: "1.15rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h3 style={{ margin: 0, color: "var(--color-navy-blue)", fontSize: "1.05rem" }}>
                Morning Examination Room Code Command Center
              </h3>
              <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Generate unique subject-bound codes on the morning of examinations. Codes are stored hashed, bound strictly to the selected subject + exam, and auto-expire.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="form-input"
                value={codeValidMinutes}
                onChange={(e) => setCodeValidMinutes(Number(e.target.value))}
                style={{ width: "auto", fontSize: "0.82rem" }}
              >
                <option value={90}>Valid 90 Minutes</option>
                <option value={120}>Valid 2 Hours</option>
                <option value={180}>Valid 3 Hours (Morning Session)</option>
                <option value={360}>Valid 6 Hours (Full Day)</option>
              </select>
              <button
                type="button"
                onClick={handleBatchGenerateCodes}
                disabled={batchGenerating || selectedExamIds.length === 0}
                className="btn btn-primary"
                style={{ fontSize: "0.82rem" }}
              >
                <FiKey style={{ marginRight: "0.35rem" }} />
                {batchGenerating
                  ? "Minting Batch Codes..."
                  : `Batch Generate Codes (${selectedExamIds.length} Selected)`}
              </button>
            </div>
          </div>

          {/* Newly Generated Morning Invigilator Code Slip */}
          {issuedCodeSlips.length > 0 && (
            <div style={{ background: "#f0fdf4", border: "2px solid #16a34a", borderRadius: "12px", padding: "1.15rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div>
                  <strong style={{ color: "#14532d", fontSize: "0.98rem" }}>
                    Invigilator Morning Room Code Slip (Shown Once — Keep Confidential)
                  </strong>
                  <div style={{ fontSize: "0.78rem", color: "#166534" }}>
                    Distribute each subject code only to the authorized examination hall invigilator.
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="button" onClick={() => window.print()} className="btn btn-outline" style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}>
                    <FiPrinter style={{ marginRight: "0.3rem" }} /> Print Slip
                  </button>
                  <button type="button" onClick={() => setIssuedCodeSlips([])} className="btn btn-outline" style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}>
                    Dismiss
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
                {issuedCodeSlips.map((slip) => (
                  <div key={slip.examId} style={{ background: "#ffffff", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "0.75rem 0.9rem" }}>
                    <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#0A2540" }}>
                      {slip.className} · {slip.subjectName}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: "1.25rem", fontWeight: 900, color: "#15803d", letterSpacing: "0.08em", margin: "0.25rem 0" }}>
                      {slip.plainCode}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#475569" }}>
                      Expires: {new Date(slip.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "12px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)", textAlign: "left" }}>
                  <th style={{ padding: "0.8rem" }}>Select</th>
                  <th style={{ padding: "0.8rem" }}>Examination &amp; Class</th>
                  <th style={{ padding: "0.8rem" }}>Fee Rule</th>
                  <th style={{ padding: "0.8rem" }}>Active Room Code</th>
                  <th style={{ padding: "0.8rem" }}>Room Status</th>
                  <th style={{ padding: "0.8rem", textAlign: "center" }}>Hall Activity</th>
                  <th style={{ padding: "0.8rem", textAlign: "right" }}>Controls</th>
                </tr>
              </thead>
              <tbody>
                {scheduledExams.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                      No scheduled examinations yet. Approve a teacher submission in Tab 1 or create an exam in Tab 3.
                    </td>
                  </tr>
                ) : (
                  scheduledExams.map((ex) => (
                    <tr key={ex.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "0.8rem" }}>
                        <input
                          type="checkbox"
                          checked={selectedExamIds.includes(ex.id)}
                          onChange={(e) =>
                            setSelectedExamIds((prev) =>
                              e.target.checked ? [...prev, ex.id] : prev.filter((id) => id !== ex.id)
                            )
                          }
                        />
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        <div style={{ fontWeight: 800, color: "var(--color-navy-blue)" }}>{ex.title}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {ex.className} · {ex.subjectName} · {ex.questionCount} Qs / {ex.durationMinutes}m
                        </div>
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        <span style={{ fontSize: "0.74rem", fontWeight: 700, padding: "0.18rem 0.5rem", borderRadius: "999px", background: ex.requireFeeClearance ? "var(--status-info-bg)" : "var(--bg-secondary)", color: ex.requireFeeClearance ? "var(--status-info-text)" : "var(--text-muted)" }}>
                          {ex.requireFeeClearance ? "Fee-Cleared Only" : "Open Enrolment"}
                        </span>
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        {ex.activeRoomCodePreview ? (
                          <div>
                            <div style={{ fontFamily: "monospace", fontWeight: 800, color: "var(--status-success-text)" }}>
                              {ex.activeRoomCodePreview}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              By {ex.activeRoomCodeGeneratedBy || "Exam Officer"}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>No active code</span>
                        )}
                      </td>
                      <td style={{ padding: "0.8rem" }}>
                        <span
                          style={{
                            padding: "0.2rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            background: ex.status === "LIVE" ? "var(--status-success-bg)" : "var(--bg-secondary)",
                            color: ex.status === "LIVE" ? "var(--status-success-text)" : "var(--text-secondary)",
                          }}
                        >
                          {ex.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.8rem", textAlign: "center", fontSize: "0.78rem" }}>
                        {ex.activeCount} Live · {ex.submittedCount} Done · {ex.terminatedCount} Locked
                      </td>
                      <td style={{ padding: "0.8rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => handleGenerateSingleCode(ex.id)}
                            disabled={generatingCodeId === ex.id}
                            className="btn btn-primary"
                            style={{ padding: "0.32rem 0.65rem", fontSize: "0.74rem" }}
                          >
                            <FiKey style={{ marginRight: "0.25rem" }} />
                            {generatingCodeId === ex.id ? "..." : ex.activeRoomCodePreview ? "Rotate Code" : "Generate Code"}
                          </button>
                          {ex.activeRoomCodePreview && (
                            <button
                              type="button"
                              onClick={() => handleRevokeCode(ex.id, ex.title)}
                              className="btn btn-outline"
                              style={{ padding: "0.32rem 0.6rem", fontSize: "0.74rem", color: "var(--status-error-text)" }}
                            >
                              Revoke
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await updateScheduledExamStatus({
                                examId: ex.id,
                                status: ex.status === "LIVE" ? "CLOSED" : "LIVE",
                              });
                              await refreshAll();
                            }}
                            className="btn btn-outline"
                            style={{ padding: "0.32rem 0.6rem", fontSize: "0.74rem" }}
                          >
                            {ex.status === "LIVE" ? "Close Room" : "Open Room"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 3: EMBEDDED SCANNER, SCHEDULER & LIVE MONITOR STUDIO           */}
      {/* =================================================================== */}
      {subTab === "studio" && <ExamBankAndSchedulerStudio mode="admin" />}

      {/* =================================================================== */}
      {/* SUBMISSION INSPECTION & SINGLE-TIER APPROVAL MODAL                  */}
      {/* =================================================================== */}
      {inspectedSubmission && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-card" style={{ maxWidth: "880px", width: "96%", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--color-primary-green)", textTransform: "uppercase" }}>
                  Confidential Question Review (Encrypted Vault Decrypted for Authorized Reviewer)
                </div>
                <h3 style={{ margin: "0.2rem 0", color: "var(--color-navy-blue)" }}>
                  {inspectedSubmission.title}
                </h3>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Author: <strong>{inspectedSubmission.teacherEmail}</strong> · Revision #{inspectedSubmission.revisionNumber} ·{" "}
                  First Submitted:{" "}
                  {inspectedSubmission.initialSubmittedAt
                    ? new Date(inspectedSubmission.initialSubmittedAt).toLocaleString("en-NG")
                    : "N/A"}
                </div>
              </div>
              <button type="button" onClick={() => setInspectedSubmission(null)} className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
                Close
              </button>
            </div>

            <div style={{ maxHeight: "340px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem", padding: "0.5rem", background: "var(--bg-secondary)", borderRadius: "8px" }}>
              {(inspectedSubmission.questions || []).map((q: any) => (
                <div key={q.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", borderRadius: "8px", padding: "0.85rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.4rem" }}>
                    Q{q.position}. {q.stem}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.35rem", fontSize: "0.8rem" }}>
                    {(q.options || []).map((o: any) => (
                      <div
                        key={o.key}
                        style={{
                          padding: "0.3rem 0.5rem",
                          borderRadius: "6px",
                          background: o.key === q.correctKey ? "var(--status-success-bg)" : "var(--bg-secondary)",
                          color: o.key === q.correctKey ? "var(--status-success-text)" : "var(--text-secondary)",
                          fontWeight: o.key === q.correctKey ? 800 : 400,
                        }}
                      >
                        <strong>{o.key.toUpperCase()}.</strong> {o.text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "0.85rem" }}>
              <div>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>
                  Scheduled Exam Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  className="form-input"
                  value={reviewDurationMin}
                  onChange={(e) => setReviewDurationMin(Math.max(5, parseInt(e.target.value || "30", 10)))}
                />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", paddingBottom: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={reviewRequireFeeClearance}
                    onChange={(e) => setReviewRequireFeeClearance(e.target.checked)}
                  />
                  Require Term Fee Clearance to Enter Room
                </label>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label" style={{ fontSize: "0.8rem" }}>
                Reviewer Feedback / Instructions (Required for Revision or Rejection)
              </label>
              <textarea
                rows={2}
                className="form-input"
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="e.g., Questions verified against SS2 syllabus; Question 4 option formatting fixed..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={deciding}
                onClick={() => handleDecision("REJECT")}
                className="btn btn-outline"
                style={{ color: "var(--status-error-text)", borderColor: "var(--status-error-border)" }}
              >
                <FiXCircle style={{ marginRight: "0.3rem" }} /> Reject Packet
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => handleDecision("REQUEST_REVISION")}
                className="btn btn-outline"
                style={{ color: "var(--status-warning-text)", borderColor: "var(--status-warning-border)" }}
              >
                <FiAlertTriangle style={{ marginRight: "0.3rem" }} /> Request Corrections
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => handleDecision("APPROVE")}
                className="btn btn-primary"
              >
                <FiCheckCircle style={{ marginRight: "0.3rem" }} />
                {deciding ? "Recording..." : "Approve & Provision Examination Room"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
