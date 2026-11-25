"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiPrinter,
  FiCheckCircle,
  FiUploadCloud,
  FiLayers,
  FiUnlock,
  FiCpu,
  FiSend,
  FiAlertTriangle,
  FiTrendingUp,
  FiArrowRight,
  FiRefreshCw,
} from "react-icons/fi";
import {
  uploadManualResult,
  uploadBulkResults,
  computeClassBroadsheetAction,
  signOffClassBroadsheetAction,
  publishClassBroadsheetAction,
  approveSubjectSheetUnlock,
} from "@/app/actions/results";
import {
  previewClassPromotionBatch,
  executeBatchClassPromotion,
} from "@/app/actions/promotion";

type PromotionDecision = "PROMOTED" | "REPEATING" | "GRADUATED" | "WITHDRAWN";

interface PromoRow {
  studentId: number;
  wofsStudentId: string;
  fullName: string;
  enrolmentStatus: string;
  t1Average: number | null;
  t2Average: number | null;
  t3Average: number | null;
  annualAverage: number;
  subjectsCount: number;
  position: number | null;
  standing: "PROMOTE" | "REPEAT" | "NO_SCORES" | "WITHDRAWN";
  suggestedDecision: PromotionDecision;
}

interface PromoPreviewData {
  sourceClass: { ClassID: number; ClassName: string; Level: string };
  sourceSessionName: string;
  allTerms?: Array<{ TermID: number; SessionName: string; TermName: string }>;
  rows: PromoRow[];
}

export default function AdminResultsClient({
  classes: initialClasses,
  subjects,
  activeTerm,
  terms = [],
}: {
  classes: any[];
  subjects: any[];
  activeTerm: any;
  terms?: any[];
}) {
  const router = useRouter();
  const [classesState, setClassesState] = useState<{ base: any[]; items: any[] }>(() => ({
    base: initialClasses,
    items: initialClasses,
  }));
  const classes = classesState.base === initialClasses ? classesState.items : initialClasses;
  const setClasses = (updater: any[] | ((prev: any[]) => any[])) => {
    setClassesState((prevState) => {
      const current = prevState.base === initialClasses ? prevState.items : initialClasses;
      const next = typeof updater === "function" ? updater(current) : updater;
      return { base: initialClasses, items: next };
    });
  };
  const [activeTab, setActiveTab] = useState<
    "broadsheets" | "unlocks" | "upload" | "promotion"
  >("broadsheets");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Batch Promotion & Cumulative Broadsheet Wizard State
  const sessionList: string[] = Array.from(
    new Set(
      [
        ...(terms || []).map((t) => t.SessionName).filter(Boolean),
        activeTerm?.SessionName || "2026/2027",
      ].filter(Boolean)
    )
  );
  const [promoSourceClassId, setPromoSourceClassId] = useState<number>(
    initialClasses[0]?.ClassID || 1
  );
  const [promoSession, setPromoSession] = useState<string>(
    activeTerm?.SessionName || sessionList[0] || "2026/2027"
  );
  const [promoThreshold, setPromoThreshold] = useState<number>(50);
  const [promoDivisorMode, setPromoDivisorMode] = useState<
    "ENTERED_TERMS" | "ALL_SESSION_TERMS"
  >("ENTERED_TERMS");
  const [promoPreview, setPromoPreview] = useState<PromoPreviewData | null>(null);
  const [promoDecisions, setPromoDecisions] = useState<Record<number, PromotionDecision>>({});
  const [promoTargetClassId, setPromoTargetClassId] = useState<string>("");
  const [promoRepeatClassId, setPromoRepeatClassId] = useState<string>("");
  const [promoTargetTermId, setPromoTargetTermId] = useState<string>("");
  const [promoTargetSessionName, setPromoTargetSessionName] = useState<string>("");
  const [promoGraduating, setPromoGraduating] = useState<boolean>(false);
  const [promoReason, setPromoReason] = useState<string>(
    "End-of-session academic promotion & placement"
  );
  const [promoLoading, setPromoLoading] = useState(false);

  // Manual Upload Form
  const [studentAdmissionNo, setStudentAdmissionNo] = useState("");
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]?.SubjectName || "Mathematics");
  const [caScore, setCaScore] = useState("");
  const [examScore, setExamScore] = useState("");

  const termId = activeTerm?.TermID || 1;

  // Flatten submitted/approved or unlock-requested sheets across classes
  const allSheets = classes.flatMap((cls) =>
    (cls.SubjectSubmissions || []).map((sub: any) => ({
      ...sub,
      className: cls.ClassName,
      subjectName: sub.Subject?.SubjectName || `Subject #${sub.SubjectID}`,
      teacherEmail: sub.Teacher?.Email || `Teacher #${sub.TeacherID}`,
    }))
  );

  const handleComputeBroadsheet = async (classId: number) => {
    setLoading(true);
    setMessage(null);
    const res = await computeClassBroadsheetAction(classId, termId);
    if (res.success && res.broadsheet) {
      setClasses((prev) =>
        prev.map((c) => (c.ClassID === classId ? { ...c, Broadsheets: [res.broadsheet] } : c))
      );
      setMessage({ type: "success", text: res.message || "Broadsheet computed!" });
    } else {
      setMessage({ type: "error", text: res.error || "Failed to compute broadsheet." });
    }
    setLoading(false);
  };

  const handleSignOffBroadsheet = async (classId: number) => {
    const note = prompt(
      "Enter Principal's official sign-off remark for this class broadsheet:",
      "Satisfactory academic performance. Approved for publication."
    );
    if (note === null) return;

    setLoading(true);
    setMessage(null);
    const res = await signOffClassBroadsheetAction(classId, termId, note);
    if (res.success && res.broadsheet) {
      setClasses((prev) =>
        prev.map((c) => (c.ClassID === classId ? { ...c, Broadsheets: [res.broadsheet] } : c))
      );
      setMessage({ type: "success", text: res.message || "Broadsheet signed off!" });
    } else {
      setMessage({ type: "error", text: res.error || "Failed to sign off broadsheet." });
    }
    setLoading(false);
  };

  const handlePublishBroadsheet = async (classId: number, isRepublish: boolean) => {
    const reason = isRepublish
      ? prompt(
          "Enter a reason for updating the already published report cards:",
          "Post-publication score correction approved"
        )
      : "Initial terminal publication";
    if (reason === null) return;

    setLoading(true);
    setMessage(null);
    const res = await publishClassBroadsheetAction(classId, termId, reason || undefined);
    if (res.success) {
      setClasses((prev) =>
        prev.map((c) =>
          c.ClassID === classId
            ? {
                ...c,
                Broadsheets: [
                  {
                    ...(c.Broadsheets?.[0] || {}),
                    status: "PUBLISHED",
                    isStale: false,
                    publishedAt: new Date().toISOString(),
                  },
                ],
              }
            : c
        )
      );
      setMessage({ type: "success", text: res.message || "Report cards published!" });
    } else {
      setMessage({ type: "error", text: res.error || "Failed to publish report cards." });
    }
    setLoading(false);
  };

  const handleUnlockSheet = async (submissionId: number) => {
    const note = prompt(
      "Enter a written reason to unlock this score sheet for 24 hours:",
      "Approved teacher request for score correction"
    );
    if (!note) return;

    setLoading(true);
    setMessage(null);
    const res = await approveSubjectSheetUnlock(submissionId, note);
    if (res.success) {
      setClasses((prev) =>
        prev.map((c) => ({
          ...c,
          SubjectSubmissions: (c.SubjectSubmissions || []).map((s: any) =>
            s.id === submissionId ? { ...s, Status: "Draft", UnlockedReason: note } : s
          ),
        }))
      );
      setMessage({
        type: "success",
        text: "Sheet unlocked to DRAFT for a 24-hour correction window.",
      });
    } else {
      setMessage({ type: "error", text: res.error || "Failed to unlock sheet." });
    }
    setLoading(false);
  };

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await uploadManualResult({
      admissionNo: studentAdmissionNo.trim(),
      subjectName: selectedSubject,
      caScore: Number(caScore),
      examScore: Number(examScore),
    });

    if (res.error) {
      setMessage({ type: "error", text: res.error });
    } else {
      setMessage({ type: "success", text: "Result uploaded successfully via single write path!" });
      setStudentAdmissionNo("");
      setCaScore("");
      setExamScore("");
    }
    setLoading(false);
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvData = event.target?.result as string;
      const res = await uploadBulkResults(csvData);
      if (res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({ type: "success", text: res.message || "Bulk upload successful!" });
      }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleLoadPromotionPreview = async () => {
    setPromoLoading(true);
    setMessage(null);
    const res = await previewClassPromotionBatch({
      sourceClassId: Number(promoSourceClassId),
      sourceSessionName: promoSession,
      passThresholdPct: Number(promoThreshold) || 50,
      divisorMode: promoDivisorMode,
    });
    if (res.success && res.rows) {
      setPromoPreview(res);
      const initialDecisions: Record<number, "PROMOTED" | "REPEATING" | "GRADUATED" | "WITHDRAWN"> = {};
      for (const r of res.rows) {
        initialDecisions[r.studentId] = r.suggestedDecision;
      }
      setPromoDecisions(initialDecisions);
      setPromoTargetClassId(res.suggestedTargetClassId ? String(res.suggestedTargetClassId) : "");
      setPromoRepeatClassId(String(promoSourceClassId));
      setPromoGraduating(Boolean(res.suggestedIsGraduatingClass));
      setPromoTargetTermId(res.suggestedTargetTermId ? String(res.suggestedTargetTermId) : "");
      setPromoTargetSessionName(res.suggestedTargetSessionName || "");
    } else {
      setMessage({ type: "error", text: res.error || "Failed to load promotion preview." });
    }
    setPromoLoading(false);
  };

  const handleExecutePromotion = async () => {
    if (!promoPreview?.rows?.length) return;
    const decisionsList = promoPreview.rows.map((r) => ({
      studentId: r.studentId,
      decision: promoDecisions[r.studentId] || r.suggestedDecision,
    }));

    const promotedCount = decisionsList.filter((d) => d.decision === "PROMOTED").length;
    const graduatedCount = decisionsList.filter((d) => d.decision === "GRADUATED").length;
    const repeatingCount = decisionsList.filter((d) => d.decision === "REPEATING").length;
    const withdrawnCount = decisionsList.filter((d) => d.decision === "WITHDRAWN").length;

    const targetName = promoGraduating
      ? "GRADUATED (Final-Year Alumni)"
      : classes.find((c) => String(c.ClassID) === promoTargetClassId)?.ClassName || "Selected Class";

    if (
      !confirm(
        `Execute batch transition for ${promoPreview.sourceClass.ClassName}?\n\n` +
          `• Promoted: ${promotedCount} -> ${targetName}\n` +
          `• Graduated: ${graduatedCount}\n` +
          `• Repeating: ${repeatingCount}\n` +
          `• Withdrawn: ${withdrawnCount}\n\n` +
          `Every student's permanent WOFS-STU ID will remain unchanged.`
      )
    ) {
      return;
    }

    setPromoLoading(true);
    setMessage(null);
    const res = await executeBatchClassPromotion({
      sourceClassId: Number(promoPreview.sourceClass.ClassID),
      sourceSessionName: promoPreview.sourceSessionName,
      targetClassId: !promoGraduating && promoTargetClassId ? Number(promoTargetClassId) : null,
      repeatClassId: promoRepeatClassId ? Number(promoRepeatClassId) : null,
      targetTermId: promoTargetTermId ? Number(promoTargetTermId) : null,
      targetSessionName: promoTargetSessionName || undefined,
      isGraduatingClass: promoGraduating,
      passThresholdPct: Number(promoThreshold) || 50,
      reason: promoReason,
      decisions: decisionsList,
    });

    if (res.success) {
      setMessage({ type: "success", text: res.message || "Batch promotion completed!" });
      router.refresh();
      await handleLoadPromotionPreview();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to execute class promotion." });
      setPromoLoading(false);
    }
  };

  return (
    <div>
      {message && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            borderRadius: "var(--radius-md)",
            background: message.type === "error" ? "var(--status-error-bg)" : "var(--status-success-bg)",
            color: message.type === "error" ? "var(--status-error-text)" : "var(--status-success-text)",
            border: `1px solid ${message.type === "error" ? "var(--status-error-border)" : "var(--status-success-border)"}`,
            fontWeight: "bold",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          borderBottom: "2px solid var(--color-gray-200)",
          marginBottom: "2rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setActiveTab("broadsheets")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1rem",
            fontWeight: "bold",
            color: activeTab === "broadsheets" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom:
              activeTab === "broadsheets"
                ? "3px solid var(--color-primary-green)"
                : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FiLayers /> Broadsheets, Sign-Off & Publishing ({classes.length} Arms)
        </button>

        <button
          onClick={() => setActiveTab("unlocks")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1rem",
            fontWeight: "bold",
            color: activeTab === "unlocks" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom:
              activeTab === "unlocks"
                ? "3px solid var(--color-primary-green)"
                : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FiUnlock /> Sheet Unlock Queue ({allSheets.filter((s) => s.Status !== "Draft" || s.UnlockRequestedBy).length})
        </button>

        <button
          onClick={() => setActiveTab("upload")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1rem",
            fontWeight: "bold",
            color: activeTab === "upload" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom:
              activeTab === "upload"
                ? "3px solid var(--color-primary-green)"
                : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FiUploadCloud /> Bulk CSV / Manual Score Override
        </button>

        <button
          onClick={() => setActiveTab("promotion")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1rem",
            fontWeight: "bold",
            color: activeTab === "promotion" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom:
              activeTab === "promotion"
                ? "3px solid var(--color-primary-green)"
                : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FiTrendingUp /> Annual Cumulative &amp; Class Promotion
        </button>
      </div>

      {/* TAB 1: BROADSHEETS, SIGN-OFF & VERSIONED PUBLISHING */}
      {activeTab === "broadsheets" && (
        <div
          style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            overflowX: "auto",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--color-gray-50)",
                  borderBottom: "2px solid var(--color-gray-200)",
                }}
              >
                <th style={{ padding: "1rem", textAlign: "left" }}>Class</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Class Teacher</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Enrolled</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Sheet Status</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Approval &amp; Publish Status</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}
                  >
                    No class arms found.
                  </td>
                </tr>
              ) : (
                classes.map((cls) => {
                  const totalSubj = cls._count?.TeacherMaps || 0;
                  const submitted = cls.SubjectSubmissions?.length || 0;
                  const isAllSubmitted = totalSubj > 0 && submitted >= totalSubj;
                  const bs = cls.Broadsheets?.[0] || null;
                  const bsStatus = bs?.status || "OPEN";
                  const isStale = Boolean(bs?.isStale);

                  return (
                    <tr key={cls.ClassID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                      <td
                        data-label="Class Arm"
                        style={{ padding: "1rem", fontWeight: "bold", color: "var(--color-navy-blue)" }}
                      >
                        {cls.ClassName} ({cls.Level})
                      </td>
                      <td data-label="Class Teacher" style={{ padding: "1rem", color: "var(--color-gray-700)" }}>
                        {cls.FormMaster?.Email || (
                          <span style={{ color: "var(--color-gray-400)", fontStyle: "italic" }}>
                            Not Assigned
                          </span>
                        )}
                      </td>
                      <td
                        data-label="Enrolled"
                        style={{ padding: "1rem", textAlign: "center", fontWeight: "600" }}
                      >
                        {cls._count?.Students || 0}
                      </td>
                      <td data-label="Sheet Status" style={{ padding: "1rem", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "0.25rem 0.75rem",
                            borderRadius: "var(--radius-full)",
                            fontSize: "0.82rem",
                            fontWeight: "bold",
                            background: isAllSubmitted ? "var(--status-success-bg)" : "var(--status-warning-bg)",
                            color: isAllSubmitted ? "var(--status-success-text)" : "var(--status-warning-text)",
                          }}
                        >
                          {submitted} / {totalSubj} Sheets
                        </span>
                      </td>
                      <td data-label="Broadsheet State" style={{ padding: "1rem", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.25rem", alignItems: "center" }}>
                          <span
                            style={{
                              padding: "0.2rem 0.65rem",
                              borderRadius: "999px",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              background:
                                bsStatus === "PUBLISHED"
                                  ? "var(--status-success-bg)"
                                  : bsStatus === "SIGNED_OFF"
                                  ? "var(--status-purple-bg)"
                                  : bsStatus === "COMPUTED"
                                  ? "var(--status-info-bg)"
                                  : "var(--bg-tertiary)",
                              color:
                                bsStatus === "PUBLISHED"
                                  ? "var(--status-success-text)"
                                  : bsStatus === "SIGNED_OFF"
                                  ? "var(--status-purple-text)"
                                  : bsStatus === "COMPUTED"
                                  ? "var(--status-info-text)"
                                  : "var(--text-secondary)",
                            }}
                          >
                            {bsStatus} {bs?.computeVersion ? `(v${bs.computeVersion})` : ""}
                          </span>
                          {isStale && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--status-error-text)",
                                background: "var(--status-error-bg)",
                                border: "1px solid var(--status-error-border)",
                                padding: "0.1rem 0.45rem",
                                borderRadius: "4px",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <FiAlertTriangle size={11} /> Stale — Recompute
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => handleComputeBroadsheet(cls.ClassID)}
                            disabled={loading}
                            className="btn btn-outline"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            title="Compute 1-2-2-4 rankings & subject statistics"
                          >
                            <FiCpu /> Compute
                          </button>

                          <button
                            onClick={() => handleSignOffBroadsheet(cls.ClassID)}
                            disabled={loading}
                            className="btn btn-outline"
                            style={{
                              padding: "0.35rem 0.65rem",
                              fontSize: "0.8rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              borderColor: "var(--status-purple-border)",
                              color: "var(--status-purple-text)",
                            }}
                            title="Principal Sign-Off"
                          >
                            <FiCheckCircle /> Sign Off
                          </button>

                          <button
                            onClick={() => handlePublishBroadsheet(cls.ClassID, bsStatus === "PUBLISHED")}
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                            title="Publish versioned ReportCards with SHA-256 snapshot"
                          >
                            <FiSend /> {bsStatus === "PUBLISHED" ? "Republish (New Ver)" : "Publish"}
                          </button>

                          <Link
                            href={`/portal/broadsheet/${cls.ClassID}`}
                            target="_blank"
                            className="btn btn-outline"
                            style={{
                              padding: "0.35rem 0.65rem",
                              fontSize: "0.8rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}
                          >
                            <FiPrinter /> Broadsheet
                          </Link>

                          <Link
                            href={`/portal/broadsheet/${cls.ClassID}?mode=cumulative`}
                            target="_blank"
                            className="btn btn-outline"
                            style={{
                              padding: "0.35rem 0.65rem",
                              fontSize: "0.8rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              borderColor: "var(--status-success-border)",
                              color: "var(--status-success-text)",
                            }}
                            title="Open 3rd-Term Annual Cumulative Broadsheet (T1 + T2 + T3)"
                          >
                            <FiTrendingUp /> Annual Cumul.
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: SHEET UNLOCK QUEUE (Section B.4.1 & B.5 Separation of Duties) */}
      {activeTab === "unlocks" && (
        <div
          style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            overflowX: "auto",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "1rem", textAlign: "left" }}>Class &amp; Subject</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Assigned Teacher</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Current Status</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Unlock Request Reason</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {allSheets.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                    No submitted sheets or pending unlock requests for the active term.
                  </td>
                </tr>
              ) : (
                allSheets.map((sheet: any) => (
                  <tr key={sheet.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                    <td style={{ padding: "1rem", fontWeight: "bold", color: "var(--color-navy-blue)" }}>
                      {sheet.className} — {sheet.subjectName} (v{sheet.Version || 1})
                    </td>
                    <td style={{ padding: "1rem", color: "var(--color-gray-700)" }}>{sheet.teacherEmail}</td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          background: sheet.Status === "Draft" ? "var(--bg-tertiary)" : "var(--status-warning-bg)",
                          color: sheet.Status === "Draft" ? "var(--text-secondary)" : "var(--status-warning-text)",
                        }}
                      >
                        {sheet.Status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                      {sheet.UnlockRequestedReason || sheet.UnlockedReason || (
                        <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                          No formal request note
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      {sheet.Status !== "Draft" ? (
                        <button
                          onClick={() => handleUnlockSheet(sheet.id)}
                          disabled={loading}
                          className="btn btn-outline"
                          style={{
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.82rem",
                            borderColor: "var(--status-warning-border)",
                            color: "var(--status-warning-text)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <FiUnlock /> Unlock (24h Window)
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.82rem", color: "var(--status-success-text)", fontWeight: 600 }}>
                          Open in Draft
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: MANUAL / BULK UPLOAD OVERRIDE */}
      {activeTab === "upload" && (
        <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          {/* Bulk Upload Widget */}
          <div
            style={{
              background: "var(--color-white)",
              padding: "2rem",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>Bulk CSV Score Import</h3>
            <p style={{ color: "var(--color-gray-600)", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
              Upload a spreadsheet with scores. Format: <code>WofsStudentID, SubjectName, CAScore, ExamScore</code>
            </p>

            <label
              style={{
                display: "block",
                border: "2px dashed var(--color-gray-300)",
                padding: "3rem 1rem",
                textAlign: "center",
                borderRadius: "var(--radius-md)",
                background: "var(--color-gray-50)",
                cursor: "pointer",
              }}
            >
              <FiUploadCloud size={40} style={{ color: "var(--color-primary-green)", marginBottom: "0.5rem" }} />
              <div style={{ fontWeight: "bold", color: "var(--color-navy-blue)" }}>Click to browse CSV</div>
              <input
                type="file"
                accept=".csv"
                onChange={handleBulkUpload}
                style={{ display: "none" }}
                disabled={loading}
              />
            </label>
          </div>

          {/* Manual Entry Form */}
          <div
            style={{
              background: "var(--color-white)",
              padding: "2rem",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>Manual Score Override</h3>
            <form onSubmit={handleManualUpload}>
              <div className="form-group">
                <label className="form-label">WOFS Student ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. WOFS-STU-2026-000001"
                  value={studentAdmissionNo}
                  onChange={(e) => setStudentAdmissionNo(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <select
                  className="form-input"
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  required
                >
                  {subjects.map((s) => (
                    <option key={s.SubjectID} value={s.SubjectName}>
                      {s.SubjectName}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">CA Score (Max 40)</label>
                  <input
                    type="number"
                    max={40}
                    min={0}
                    className="form-input"
                    value={caScore}
                    onChange={(e) => setCaScore(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Exam Score (Max 60)</label>
                  <input
                    type="number"
                    max={60}
                    min={0}
                    className="form-input"
                    value={examScore}
                    onChange={(e) => setExamScore(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "1rem" }}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Single Score"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: 3RD-TERM ANNUAL CUMULATIVE BROADSHEET & BATCH CLASS PROMOTION WIZARD */}
      {activeTab === "promotion" && (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {/* Configuration Card */}
          <div
            style={{
              background: "var(--bg-card)",
              padding: "1.5rem",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, color: "var(--text-heading)" }}>
                  End-of-Session Cumulative Broadsheet &amp; Batch Class Promotion Wizard
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.86rem", color: "var(--text-muted)" }}>
                  Compute <strong>(Term 1 + Term 2 + Term 3)</strong> annual cumulative standings and promote an entire class arm to the next level in one transaction while preserving permanent <strong>WOFS-STU</strong> IDs.
                </p>
              </div>
              <Link
                href={`/portal/broadsheet/${promoSourceClassId}?mode=cumulative&session=${encodeURIComponent(
                  promoSession
                )}&divisor=${promoDivisorMode}`}
                target="_blank"
                className="btn btn-outline"
                style={{ fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <FiPrinter /> Open Full Annual Broadsheet
              </Link>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
                gap: "0.85rem",
                alignItems: "end",
              }}
            >
              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>Source Class Arm</label>
                <select
                  className="form-input"
                  value={promoSourceClassId}
                  onChange={(e) => setPromoSourceClassId(Number(e.target.value))}
                >
                  {classes.map((c) => (
                    <option key={c.ClassID} value={c.ClassID}>
                      {c.ClassName} ({c._count?.Students || 0} students)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>Closing Academic Session</label>
                <select
                  className="form-input"
                  value={promoSession}
                  onChange={(e) => setPromoSession(e.target.value)}
                >
                  {sessionList.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>Promotion Pass Mark (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="form-input"
                  value={promoThreshold}
                  onChange={(e) => setPromoThreshold(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: "0.82rem" }}>Cumulative Average Rule</label>
                <select
                  className="form-input"
                  value={promoDivisorMode}
                  onChange={(e) =>
                    setPromoDivisorMode(e.target.value as "ENTERED_TERMS" | "ALL_SESSION_TERMS")
                  }
                >
                  <option value="ENTERED_TERMS">Average Over Terms Sat</option>
                  <option value="ALL_SESSION_TERMS">Strict Full Session Terms (&divide;3)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleLoadPromotionPreview}
                disabled={promoLoading}
                className="btn btn-primary"
                style={{ height: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}
              >
                <FiRefreshCw /> {promoLoading ? "Loading..." : "Load Class Roster"}
              </button>
            </div>
          </div>

          {/* Preview & Execute Panel */}
          {promoPreview && (
            <div
              style={{
                background: "var(--bg-card)",
                padding: "1.5rem",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-sm)",
                display: "grid",
                gap: "1.25rem",
              }}
            >
              {/* Destination Settings */}
              <div
                style={{
                  background: "var(--bg-secondary)",
                  padding: "1rem 1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "grid",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ fontWeight: 800, color: "var(--text-heading)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span>Transition Plan for {promoPreview.sourceClass?.ClassName}</span>
                    <FiArrowRight />
                    <span style={{ color: "var(--brand-primary)" }}>
                      {promoGraduating
                        ? "Graduated Alumni"
                        : classes.find((c) => String(c.ClassID) === promoTargetClassId)?.ClassName || "Select Target Class"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}
                      onClick={() => {
                        const reset: Record<number, PromotionDecision> = {};
                        promoPreview.rows.forEach((r) => {
                          reset[r.studentId] = r.suggestedDecision;
                        });
                        setPromoDecisions(reset);
                      }}
                    >
                      Apply Auto-Standing
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}
                      onClick={() => {
                        const allPromoted: Record<number, PromotionDecision> = {};
                        promoPreview.rows.forEach((r) => {
                          allPromoted[r.studentId] =
                            r.standing === "WITHDRAWN"
                              ? "WITHDRAWN"
                              : promoGraduating
                              ? "GRADUATED"
                              : "PROMOTED";
                        });
                        setPromoDecisions(allPromoted);
                      }}
                    >
                      Mark All {promoGraduating ? "Graduated" : "Promoted"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "0.85rem", alignItems: "end" }}>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 700, fontSize: "0.84rem", marginBottom: "0.45rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={promoGraduating}
                        onChange={(e) => setPromoGraduating(e.target.checked)}
                      />
                      Graduating Final-Year Class (e.g. SS 3 / Pry 6)
                    </label>
                    <select
                      className="form-input"
                      disabled={promoGraduating}
                      value={promoTargetClassId}
                      onChange={(e) => setPromoTargetClassId(e.target.value)}
                    >
                      <option value="">-- Select Target Promoted Class --</option>
                      {classes.map((c) => (
                        <option key={c.ClassID} value={String(c.ClassID)}>
                          {c.ClassName} ({c.Level})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Repeating Students Destination</label>
                    <select
                      className="form-input"
                      value={promoRepeatClassId}
                      onChange={(e) => setPromoRepeatClassId(e.target.value)}
                    >
                      {classes.map((c) => (
                        <option key={c.ClassID} value={String(c.ClassID)}>
                          {c.ClassName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Next Session Opening Term (Optional)</label>
                    <select
                      className="form-input"
                      value={promoTargetTermId}
                      onChange={(e) => setPromoTargetTermId(e.target.value)}
                    >
                      <option value="">Update Current Class Only</option>
                      {(promoPreview.allTerms || terms || []).map((t) => (
                        <option key={t.TermID} value={String(t.TermID)}>
                          {t.SessionName} - {t.TermName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Audit Note / Reason</label>
                    <input
                      type="text"
                      className="form-input"
                      value={promoReason}
                      onChange={(e) => setPromoReason(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Roster Decision Table */}
              <div style={{ overflowX: "auto" }}>
                <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)" }}>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>Pos</th>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>WOFS Student ID</th>
                      <th style={{ padding: "0.75rem", textAlign: "left" }}>Student Name</th>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>T1 %</th>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>T2 %</th>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>T3 %</th>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>Annual Avg</th>
                      <th style={{ padding: "0.75rem", textAlign: "center" }}>Recommendation</th>
                      <th style={{ padding: "0.75rem", textAlign: "right" }}>Transition Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoPreview.rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                          No students currently assigned to {promoPreview.sourceClass?.ClassName}.
                        </td>
                      </tr>
                    ) : (
                      promoPreview.rows.map((r) => {
                        const decision = promoDecisions[r.studentId] || r.suggestedDecision;
                        return (
                          <tr key={r.studentId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td data-label="Pos" style={{ padding: "0.75rem", textAlign: "center", fontWeight: 700 }}>
                              {r.position ?? "—"}
                            </td>
                            <td data-label="WOFS Student ID" style={{ padding: "0.75rem", fontFamily: "monospace", fontWeight: 700, color: "var(--text-heading)" }}>
                              {r.wofsStudentId}
                            </td>
                            <td data-label="Student Name" style={{ padding: "0.75rem", fontWeight: 600 }}>
                              <div>{r.fullName}</div>
                              {r.enrolmentStatus && r.enrolmentStatus !== "ACTIVE" && (
                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 700 }}>
                                  Status: {r.enrolmentStatus}
                                </span>
                              )}
                            </td>
                            <td data-label="T1" style={{ padding: "0.75rem", textAlign: "center" }}>{r.t1Average ?? "—"}</td>
                            <td data-label="T2" style={{ padding: "0.75rem", textAlign: "center" }}>{r.t2Average ?? "—"}</td>
                            <td data-label="T3" style={{ padding: "0.75rem", textAlign: "center" }}>{r.t3Average ?? "—"}</td>
                            <td data-label="Annual Avg" style={{ padding: "0.75rem", textAlign: "center", fontWeight: 800 }}>
                              {r.subjectsCount > 0 ? `${r.annualAverage}%` : "No Scores"}
                            </td>
                            <td data-label="Standing" style={{ padding: "0.75rem", textAlign: "center" }}>
                              <span
                                style={{
                                  padding: "0.18rem 0.55rem",
                                  borderRadius: "999px",
                                  fontSize: "0.75rem",
                                  fontWeight: 700,
                                  background:
                                    r.standing === "PROMOTE"
                                      ? "var(--status-success-bg)"
                                      : r.standing === "REPEAT"
                                      ? "var(--status-warning-bg)"
                                      : "var(--bg-tertiary)",
                                  color:
                                    r.standing === "PROMOTE"
                                      ? "var(--status-success-text)"
                                      : r.standing === "REPEAT"
                                      ? "var(--status-warning-text)"
                                      : "var(--text-muted)",
                                }}
                              >
                                {r.standing}
                              </span>
                            </td>
                            <td data-label="Decision" style={{ padding: "0.75rem", textAlign: "right" }}>
                              <select
                                className="form-input"
                                value={decision}
                                onChange={(e) =>
                                  setPromoDecisions((prev) => ({
                                    ...prev,
                                    [r.studentId]: e.target.value as PromotionDecision,
                                  }))
                                }
                                style={{ width: "auto", padding: "0.35rem 0.65rem", fontSize: "0.82rem", fontWeight: 700 }}
                              >
                                {!promoGraduating && <option value="PROMOTED">Promote to Target Class</option>}
                                <option value="GRADUATED">Graduate (Alumni)</option>
                                <option value="REPEATING">Repeat Class</option>
                                <option value="WITHDRAWN">Mark Withdrawn</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {promoPreview.rows.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
                  <div style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                    Showing {promoPreview.rows.length} students &bull; Permanent <code>WOFS-STU</code> IDs are never modified during class promotion.
                  </div>
                  <button
                    type="button"
                    onClick={handleExecutePromotion}
                    disabled={promoLoading}
                    className="btn btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", padding: "0.65rem 1.3rem" }}
                  >
                    <FiCheckCircle /> {promoLoading ? "Processing Batch..." : "Execute Batch Class Promotion"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
