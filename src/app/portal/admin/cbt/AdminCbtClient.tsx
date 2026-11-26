"use client";

import { useState } from "react";
import { liftCbtDayLock, syncSubjectQuestionPool, getCbtProviderDiagnostics } from "@/app/actions/cbt";
import {
  getAdminCbtBankAndAnalytics,
  upsertSchoolCbtQuestion,
  bulkImportSchoolCbtQuestionsCsv,
  toggleSchoolCbtQuestionActive,
  type SchoolInternalQuestionRow,
  type CbtSubjectAnalyticsRow,
} from "@/app/actions/cbtAuthoring";
import {
  SUBJECTS,
  SCHOOL_INTERNAL_SUBJECT_PRESETS,
  formatCbtSubjectLabel,
} from "@/lib/cbt-constants";
import {
  FiShield,
  FiUnlock,
  FiAlertTriangle,
  FiActivity,
  FiCheckCircle,
  FiDatabase,
  FiRefreshCw,
  FiBookOpen,
  FiBarChart2,
  FiPlus,
  FiUpload,
  FiDownload,
  FiEdit2,
  FiArchive,
  FiLock,
} from "react-icons/fi";
import ExamBankAndSchedulerStudio from "@/components/cbt/ExamBankAndSchedulerStudio";

export interface CbtAttemptAnalyticsRow {
  id: string;
  studentName: string;
  wofsStudentId: string;
  className: string;
  subjectCode: string;
  examBody: string;
  mode: string;
  status: string;
  scorePct: number | null;
  hardStrikes: number;
  questionCount: number;
  startedAt: string;
}

function escapeCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadCsvFile(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const ALL_KNOWN_SUBJECTS = Array.from(
  new Set([...SUBJECTS, ...SCHOOL_INTERNAL_SUBJECT_PRESETS])
);

export default function AdminCbtClient({
  initialActiveLocks,
  initialRecentAttempts,
  initialRecentEvents,
  initialProviderDiagnostics,
  initialBankQuestions = [],
  initialSubjectAnalytics = [],
  initialAttemptRows = [],
  initialInternalSubjectCounts = [],
}: {
  initialActiveLocks: any[];
  initialRecentAttempts: any[];
  initialRecentEvents: any[];
  initialProviderDiagnostics?: any;
  initialBankQuestions?: SchoolInternalQuestionRow[];
  initialSubjectAnalytics?: CbtSubjectAnalyticsRow[];
  initialAttemptRows?: CbtAttemptAnalyticsRow[];
  initialInternalSubjectCounts?: Array<{ subjectCode: string; count: number }>;
}) {
  const [activeLocks, setActiveLocks] = useState(initialActiveLocks);
  const [recentAttempts] = useState(initialRecentAttempts);
  const [recentEvents] = useState(initialRecentEvents);
  const [providerDiag, setProviderDiag] = useState<any>(initialProviderDiagnostics);
  const [activeTab, setActiveTab] = useState<
    "locks" | "attempts" | "events" | "providers" | "bank" | "exams" | "analytics"
  >("exams");
  const [loading, setLoading] = useState(false);
  const [syncingSubject, setSyncingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // School Question Bank (Option C) state
  const [bankQuestions, setBankQuestions] = useState<SchoolInternalQuestionRow[]>(initialBankQuestions);
  const [subjectAnalytics, setSubjectAnalytics] = useState<CbtSubjectAnalyticsRow[]>(initialSubjectAnalytics);
  const [attemptRows, setAttemptRows] = useState<CbtAttemptAnalyticsRow[]>(initialAttemptRows);
  const [internalSubjectCounts, setInternalSubjectCounts] = useState<
    Array<{ subjectCode: string; count: number }>
  >(initialInternalSubjectCounts);

  const [bankSubjectFilter, setBankSubjectFilter] = useState("all");
  const [bankScopeFilter, setBankScopeFilter] = useState<"ALL" | "OPEN_BANK" | "EXAM_ONLY">("ALL");
  const [bankSearch, setBankSearch] = useState("");
  const [includeInactiveBank, setIncludeInactiveBank] = useState(true);
  const [bankLoading, setBankLoading] = useState(false);

  // Create / Edit Form state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qSubjectSelect, setQSubjectSelect] = useState("basicscience");
  const [qCustomSubject, setQCustomSubject] = useState("");
  const [qExamBody, setQExamBody] = useState("SCHOOL_INTERNAL");
  const [qBankScope, setQBankScope] = useState<"OPEN_BANK" | "EXAM_ONLY">("OPEN_BANK");
  const [qTopic, setQTopic] = useState("School Term Assessment");
  const [qStem, setQStem] = useState("");
  const [qImageUrl, setQImageUrl] = useState("");
  const [qOptionA, setQOptionA] = useState("");
  const [qOptionB, setQOptionB] = useState("");
  const [qOptionC, setQOptionC] = useState("");
  const [qOptionD, setQOptionD] = useState("");
  const [qCorrectKey, setQCorrectKey] = useState<"a" | "b" | "c" | "d">("a");
  const [qExplanation, setQExplanation] = useState("");
  const [savingQuestion, setSavingQuestion] = useState(false);

  // Bulk CSV Import state
  const [csvDefaultSubject, setCsvDefaultSubject] = useState("basicscience");
  const [csvDefaultExamBody, setCsvDefaultExamBody] = useState("SCHOOL_INTERNAL");
  const [csvBankScope, setCsvBankScope] = useState<"OPEN_BANK" | "EXAM_ONLY">("OPEN_BANK");
  const [csvText, setCsvText] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportErrors, setCsvImportErrors] = useState<Array<{ rowNumber: number; error: string }>>([]);

  // Analytics export filter state
  const [analyticsSubjectFilter, setAnalyticsSubjectFilter] = useState("all");

  const refreshBankAndAnalytics = async (overrides?: {
    subjectCode?: string;
    bankScope?: "ALL" | "OPEN_BANK" | "EXAM_ONLY";
    search?: string;
    includeInactive?: boolean;
  }) => {
    setBankLoading(true);
    const subj = overrides?.subjectCode ?? bankSubjectFilter;
    const scope = overrides?.bankScope ?? bankScopeFilter;
    const searchVal = overrides?.search ?? bankSearch;
    const showArch = overrides?.includeInactive ?? includeInactiveBank;
    const res = await getAdminCbtBankAndAnalytics({
      subjectCode: subj !== "all" ? subj : undefined,
      bankScope: scope,
      search: searchVal || undefined,
      includeInactive: showArch,
    });
    if (res.success) {
      setBankQuestions(res.questions);
      setSubjectAnalytics(res.subjectAnalytics);
      setAttemptRows(res.attemptRows);
      setInternalSubjectCounts(res.internalSubjectCounts);
    } else if (res.error) {
      setMessage({ type: "error", text: res.error });
    }
    setBankLoading(false);
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQTopic("School Term Assessment");
    setQStem("");
    setQImageUrl("");
    setQOptionA("");
    setQOptionB("");
    setQOptionC("");
    setQOptionD("");
    setQCorrectKey("a");
    setQExplanation("");
  };

  const handleStartEditQuestion = (q: SchoolInternalQuestionRow) => {
    setEditingQuestionId(q.id);
    if (ALL_KNOWN_SUBJECTS.includes(q.subjectCode)) {
      setQSubjectSelect(q.subjectCode);
      setQCustomSubject("");
    } else {
      setQSubjectSelect("__custom__");
      setQCustomSubject(q.subjectCode);
    }
    setQExamBody(q.examBody || "SCHOOL_INTERNAL");
    setQBankScope(q.bankScope || "OPEN_BANK");
    setQTopic(q.topic || "School Assessment");
    setQStem(q.stem);
    setQImageUrl(q.imageUrl || "");
    const getOpt = (k: string) =>
      q.options.find((o) => o.key.toLowerCase() === k)?.text || "";
    setQOptionA(getOpt("a"));
    setQOptionB(getOpt("b"));
    setQOptionC(getOpt("c"));
    setQOptionD(getOpt("d"));
    setQCorrectKey(q.correctKey);
    setQExplanation(q.explanation || "");
    setMessage(null);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedSubject =
      qSubjectSelect === "__custom__" ? qCustomSubject.trim() : qSubjectSelect;
    if (!resolvedSubject) {
      setMessage({ type: "error", text: "Please choose or enter a subject code." });
      return;
    }

    setSavingQuestion(true);
    setMessage(null);
    const res = await upsertSchoolCbtQuestion({
      id: editingQuestionId || undefined,
      subjectCode: resolvedSubject,
      examBody: qExamBody,
      bankScope: qBankScope,
      topic: qTopic,
      stem: qStem,
      imageUrl: qImageUrl || null,
      optionA: qOptionA,
      optionB: qOptionB,
      optionC: qOptionC,
      optionD: qOptionD,
      correctKey: qCorrectKey,
      explanation: qExplanation,
    });

    if (res.success) {
      setMessage({
        type: "success",
        text: editingQuestionId
          ? `Updated school CBT question in ${formatCbtSubjectLabel(resolvedSubject)} pool.`
          : `Added new school CBT question to ${formatCbtSubjectLabel(resolvedSubject)} pool.`,
      });
      resetQuestionForm();
      await refreshBankAndAnalytics();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to save question." });
    }
    setSavingQuestion(false);
  };

  const handleBulkCsvImport = async () => {
    if (!csvText.trim()) {
      setMessage({ type: "error", text: "Paste or upload a CSV file first." });
      return;
    }
    setImportingCsv(true);
    setMessage(null);
    setCsvImportErrors([]);
    const res = await bulkImportSchoolCbtQuestionsCsv({
      csvText,
      defaultSubjectCode: csvDefaultSubject,
      defaultExamBody: csvDefaultExamBody,
      bankScope: csvBankScope,
    });
    if (res.success) {
      setCsvImportErrors(res.errors || []);
      setMessage({
        type: "success",
        text: `Imported ${res.importedCount} question(s)${
          res.skippedCount > 0 ? ` (${res.skippedCount} row(s) had validation issues)` : ""
        }.`,
      });
      if (res.importedCount > 0) {
        setCsvText("");
        await refreshBankAndAnalytics();
      }
    } else {
      setCsvImportErrors(res.errors || []);
      setMessage({ type: "error", text: res.error || "Failed to import CSV questions." });
    }
    setImportingCsv(false);
  };

  const handleToggleQuestionActive = async (q: SchoolInternalQuestionRow) => {
    setBankLoading(true);
    setMessage(null);
    const res = await toggleSchoolCbtQuestionActive(q.id, !q.isActive);
    if (res.success) {
      setMessage({
        type: "success",
        text: !q.isActive
          ? "Reactivated CBT question in active student exam pool."
          : "Archived CBT question (preserved past attempt history).",
      });
      await refreshBankAndAnalytics();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to update question status." });
    }
    setBankLoading(false);
  };

  const handleDownloadCsvTemplate = () => {
    downloadCsvFile(
      "word_of_faith_cbt_question_template.csv",
      [
        "subjectCode",
        "examBody",
        "topic",
        "stem",
        "optionA",
        "optionB",
        "optionC",
        "optionD",
        "correctKey",
        "explanation",
      ],
      [
        [
          "basicscience",
          "SCHOOL_INTERNAL",
          "Living Organisms",
          "Which organelle is responsible for photosynthesis in green plant cells?",
          "Mitochondrion",
          "Chloroplast",
          "Ribosome",
          "Nucleus",
          "B",
          "Chloroplasts contain chlorophyll, which captures light energy for photosynthesis.",
        ],
        [
          "computerstudies",
          "SCHOOL_INTERNAL",
          "Computer Hardware",
          "Which of the following is an example of volatile primary memory?",
          "RAM",
          "Hard Disk Drive",
          "DVD-ROM",
          "USB Flash Drive",
          "A",
          "RAM loses its stored contents when electrical power is switched off.",
        ],
      ]
    );
  };

  const handleExportSubjectAnalyticsCsv = () => {
    downloadCsvFile(
      `wofs_cbt_subject_analytics_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Subject Code",
        "Subject Name",
        "Total Attempts",
        "Submitted",
        "Terminated",
        "Average Score (%)",
        "Highest Score (%)",
        "Pass Rate >=50% (%)",
        "Avg Integrity Strikes",
      ],
      subjectAnalytics.map((row) => [
        row.subjectCode,
        formatCbtSubjectLabel(row.subjectCode),
        row.totalAttempts,
        row.submittedCount,
        row.terminatedCount,
        row.avgScorePct,
        row.highestScorePct,
        row.passRatePct,
        row.avgStrikes,
      ])
    );
  };

  const handleExportAttemptsCsv = () => {
    const filtered =
      analyticsSubjectFilter === "all"
        ? attemptRows
        : attemptRows.filter((r) => r.subjectCode === analyticsSubjectFilter);
    downloadCsvFile(
      `wofs_cbt_attempts_${analyticsSubjectFilter}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Attempt ID",
        "Student Name",
        "Admission No",
        "Class",
        "Subject",
        "Exam Body",
        "Mode",
        "Status",
        "Score (%)",
        "Questions",
        "Hard Strikes",
        "Started At",
      ],
      filtered.map((r) => [
        r.id,
        r.studentName,
        r.wofsStudentId,
        r.className,
        formatCbtSubjectLabel(r.subjectCode),
        r.examBody,
        r.mode,
        r.status,
        r.scorePct ?? "Pending",
        r.questionCount,
        r.hardStrikes,
        new Date(r.startedAt).toISOString(),
      ])
    );
  };

  const handleLiftLock = async (lockId: string, studentName: string) => {
    const reason = prompt(
      `Enter mandatory written reason to lift today's CBT lock for ${studentName} (Section 7.3 — audited):`,
      "Verified accidental mobile notification interruption"
    );
    if (!reason || reason.trim().length < 5) return;

    setLoading(true);
    setMessage(null);
    const res = await liftCbtDayLock(lockId, reason.trim());
    if (res.success) {
      setActiveLocks((prev) => prev.filter((l) => l.id !== lockId));
      setMessage({
        type: "success",
        text: `Lifted CBT day lock for ${studentName}. Action logged to immutable AuditLog.`,
      });
    } else {
      setMessage({ type: "error", text: res.error || "Failed to lift day lock." });
    }
    setLoading(false);
  };

  const handleSyncPool = async (subjectCode: string = "ALL") => {
    setSyncingSubject(subjectCode);
    setMessage(null);
    const res = await syncSubjectQuestionPool(subjectCode, "WASSCE");
    if (res.success) {
      const refreshed = await getCbtProviderDiagnostics();
      if (refreshed.success) {
        setProviderDiag(refreshed);
      }
      setMessage({
        type: "success",
        text: `Synchronized CBT Question Pool (${subjectCode.toUpperCase()}): ${res.totalIngested} verified questions upserted into database pool.`,
      });
    } else {
      setMessage({
        type: "error",
        text: res.error || "Failed to synchronize question pool.",
      });
    }
    setSyncingSubject(null);
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

      {/* Summary Banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            ACTIVE DAY LOCKS (2-STRIKE POLICY)
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: activeLocks.length > 0 ? "var(--status-error-text)" : "var(--status-success-text)" }}>
            {activeLocks.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            RECENT CBT ATTEMPTS
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--text-heading)" }}>
            {recentAttempts.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            INTEGRITY TELEMETRY EVENTS
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--status-warning-text)" }}>
            {recentEvents.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            CACHED CBT QUESTION POOL
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--status-success-text)" }}>
            {providerDiag?.totalCachedQuestions ?? 0}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            SCHOOL QUESTION BANK
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--color-navy-blue)" }}>
            {internalSubjectCounts.reduce((acc, s) => acc + s.count, 0)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Across {internalSubjectCounts.length} subject(s)
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          borderBottom: "2px solid var(--color-gray-200)",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setActiveTab("exams")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "exams" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "exams" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiLock /> Strict Exams &amp; Paper OCR
        </button>

        <button
          onClick={() => setActiveTab("locks")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "locks" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "locks" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiAlertTriangle /> Active Day Locks ({activeLocks.length})
        </button>

        <button
          onClick={() => setActiveTab("attempts")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "attempts" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "attempts" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiShield /> Recent Attempts ({recentAttempts.length})
        </button>

        <button
          onClick={() => setActiveTab("events")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "events" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "events" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiActivity /> Integrity Events Log ({recentEvents.length})
        </button>

        <button
          onClick={() => setActiveTab("providers")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "providers" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "providers" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiDatabase /> ALOC Keys & Question Pool ({providerDiag?.totalCachedQuestions ?? 0})
        </button>

        <button
          onClick={() => setActiveTab("bank")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "bank" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "bank" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiBookOpen /> School Question Bank ({internalSubjectCounts.reduce((acc, s) => acc + s.count, 0)})
        </button>

        <button
          onClick={() => setActiveTab("analytics")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontWeight: "bold",
            color: activeTab === "analytics" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "analytics" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <FiBarChart2 /> Analytics & Exports ({subjectAnalytics.length})
        </button>
      </div>

      {/* TAB 1: ACTIVE DAY LOCKS */}
      {activeTab === "locks" && (
        <div
          style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "1rem", textAlign: "left" }}>Student</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Class</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Day Key (Africa/Lagos)</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Lock Reason</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Override Action</th>
              </tr>
            </thead>
            <tbody>
              {activeLocks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                    <FiCheckCircle style={{ marginRight: "0.4rem", color: "var(--status-success-text)" }} />
                    No active CBT day locks today.
                  </td>
                </tr>
              ) : (
                activeLocks.map((lock: any) => {
                  const studentName =
                    lock.student?.PreferredName ||
                    `${lock.student?.FirstName || ""} ${lock.student?.LastName || ""}`.trim() ||
                    lock.student?.AdmissionNo ||
                    `Student #${lock.studentId}`;
                  return (
                    <tr key={lock.id} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                      <td style={{ padding: "1rem", fontWeight: 700, color: "var(--text-heading)" }}>
                        {studentName} ({lock.student?.AdmissionNo})
                      </td>
                      <td style={{ padding: "1rem" }}>{lock.student?.Class?.ClassName || "—"}</td>
                      <td style={{ padding: "1rem", textAlign: "center", fontFamily: "monospace", fontWeight: 700 }}>
                        {lock.dayKey}
                      </td>
                      <td style={{ padding: "1rem", color: "var(--status-error-text)", fontSize: "0.88rem" }}>{lock.reason}</td>
                      <td style={{ padding: "1rem", textAlign: "right" }}>
                        <button
                          onClick={() => handleLiftLock(lock.id, studentName)}
                          disabled={loading}
                          className="btn btn-outline"
                          style={{
                            padding: "0.4rem 0.85rem",
                            fontSize: "0.82rem",
                            borderColor: "var(--status-success-border)",
                            color: "var(--status-success-text)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <FiUnlock /> Lift Day Lock
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: RECENT ATTEMPTS */}
      {activeTab === "attempts" && (
        <div
          style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "1rem", textAlign: "left" }}>Student</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Subject & Mode</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Hard Strikes</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Score</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {recentAttempts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                    No CBT attempts recorded yet.
                  </td>
                </tr>
              ) : (
                recentAttempts.map((att: any) => (
                  <tr key={att.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                    <td style={{ padding: "1rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                      {att.student?.PreferredName || att.student?.AdmissionNo || `Student #${att.studentId}`}
                    </td>
                    <td style={{ padding: "1rem" }}>
                      {att.subjectCode?.toUpperCase()} · {att.examBody} ({att.mode})
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          background:
                            att.status === "SUBMITTED"
                              ? "var(--status-success-bg)"
                              : att.status === "TERMINATED"
                              ? "var(--status-error-bg)"
                              : "var(--status-info-bg)",
                          color:
                            att.status === "SUBMITTED"
                              ? "var(--status-success-text)"
                              : att.status === "TERMINATED"
                              ? "var(--status-error-text)"
                              : "var(--status-info-text)",
                        }}
                      >
                        {att.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "1rem",
                        textAlign: "center",
                        fontWeight: 700,
                        color: att.hardStrikes > 0 ? "var(--status-error-text)" : "var(--status-success-text)",
                      }}
                    >
                      {att.hardStrikes} / 2
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center", fontWeight: 700 }}>
                      {att.scoreTenths !== null && att.scoreTenths !== undefined
                        ? `${(att.scoreTenths / 10).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                      {new Date(att.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: INTEGRITY EVENTS LOG */}
      {activeTab === "events" && (
        <div
          style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "1rem", textAlign: "left" }}>Timestamp</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Student</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Event Type</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Severity</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Attempt ID</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                    No CBT integrity violation events recorded yet.
                  </td>
                </tr>
              ) : (
                recentEvents.map((ev: any) => (
                  <tr key={ev.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                    <td style={{ padding: "1rem", fontSize: "0.85rem" }}>
                      {new Date(ev.serverAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: 600 }}>
                      {ev.attempt?.student?.PreferredName || ev.attempt?.student?.AdmissionNo || "—"}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center", fontFamily: "monospace", fontWeight: 700 }}>
                      {ev.type}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.6rem",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: ev.isHard ? "var(--status-error-bg)" : "var(--status-warning-bg)",
                          color: ev.isHard ? "var(--status-error-text)" : "var(--status-warning-text)",
                          border: `1px solid ${ev.isHard ? "var(--status-error-border)" : "var(--status-warning-border)"}`,
                        }}
                      >
                        {ev.isHard ? "HARD STRIKE" : "SOFT SIGNAL"}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.82rem" }}>
                      #{String(ev.attemptId).slice(-8)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: ALOC KEYS & QUESTION POOL */}
      {activeTab === "providers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              padding: "1.5rem",
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
              <div>
                <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
                  CBT Provider Keys & Multi-Tier Resilience Status
                </h3>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                  Tier 1: ALOC Station v1 (`dev.aloc.com.ng`) → Tier 2: ALOC v2 (`questions.aloc.com.ng`) → Tier 3: SdashAPI → Tier 4: 17-Subject Verified Fallback Bank
                </p>
              </div>
              <button
                onClick={() => handleSyncPool("ALL")}
                disabled={syncingSubject !== null}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <FiRefreshCw />
                {syncingSubject === "ALL" ? "Synchronizing All 17 Subjects..." : "Sync All 17 Subjects Into DB Pool"}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                gap: "1rem",
              }}
            >
              <div style={{ padding: "1rem", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700 }}>
                  ALOC_API_KEY (Primary v1 + v2)
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: providerDiag?.diagnostics?.alocConfigured ? "var(--status-success-text)" : "var(--status-error-text)", marginTop: "0.25rem" }}>
                  {providerDiag?.diagnostics?.alocConfigured ? `Operational (${providerDiag.diagnostics.alocKeyPreview})` : "Missing"}
                </div>
              </div>

              <div style={{ padding: "1rem", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700 }}>
                  SDASH_API_KEY (Secondary Cloud)
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: providerDiag?.diagnostics?.sdashConfigured ? "var(--status-success-text)" : "var(--status-warning-text)", marginTop: "0.25rem" }}>
                  {providerDiag?.diagnostics?.sdashConfigured ? `Operational (${providerDiag.diagnostics.sdashKeyPreview})` : "Fallback Only"}
                </div>
              </div>

              <div style={{ padding: "1rem", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700 }}>
                  GEMINI AI TUTOR KEY
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: providerDiag?.diagnostics?.geminiConfigured ? "var(--status-success-text)" : "var(--status-warning-text)", marginTop: "0.25rem" }}>
                  {providerDiag?.diagnostics?.geminiConfigured ? `Operational (${providerDiag.diagnostics.geminiKeyPreview})` : "Heuristic Fallback"}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              overflowX: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }}>
              <thead>
                <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Subject Code</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Cached DB Questions</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Resilience Status</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(providerDiag?.subjectPools || []).map((row: any) => (
                  <tr key={row.subjectCode} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                    <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                      {row.subjectCode.toUpperCase()}
                    </td>
                    <td style={{ padding: "0.85rem 1rem", textAlign: "center", fontWeight: 700 }}>
                      {row.cachedCount}
                    </td>
                    <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          background: row.cachedCount > 0 ? "var(--status-success-bg)" : "var(--status-info-bg)",
                          color: row.cachedCount > 0 ? "var(--status-success-text)" : "var(--status-info-text)",
                        }}
                      >
                        {row.cachedCount > 0 ? "DB Pool + Cloud Ready" : "Cloud + Offline Bank Ready"}
                      </span>
                    </td>
                    <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleSyncPool(row.subjectCode)}
                        disabled={syncingSubject !== null}
                        className="btn btn-outline"
                        style={{ padding: "0.35rem 0.75rem", fontSize: "0.78rem" }}
                      >
                        {syncingSubject === row.subjectCode ? "Syncing..." : "Sync Subject Pool"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: SCHOOL QUESTION BANK (SCHOOL_INTERNAL) */}
      {activeTab === "bank" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
              gap: "1.5rem",
              alignItems: "start",
            }}
          >
            {/* Author / Edit Form */}
            <form
              onSubmit={handleSaveQuestion}
              style={{
                background: "var(--color-white)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-gray-200)",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-navy-blue)", margin: 0, display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <FiPlus /> {editingQuestionId ? "Edit School CBT Question" : "Author School-Internal CBT Question"}
                </h2>
                {editingQuestionId && (
                  <button
                    type="button"
                    onClick={resetQuestionForm}
                    className="btn btn-outline"
                    style={{ padding: "0.3rem 0.7rem", fontSize: "0.78rem" }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Subject *
                  </label>
                  <select
                    value={qSubjectSelect}
                    onChange={(e) => setQSubjectSelect(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  >
                    {ALL_KNOWN_SUBJECTS.map((subj) => (
                      <option key={subj} value={subj}>
                        {formatCbtSubjectLabel(subj)}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Subject Code...</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Exam Body / Tag
                  </label>
                  <select
                    value={qExamBody}
                    onChange={(e) => setQExamBody(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  >
                    <option value="SCHOOL_INTERNAL">SCHOOL_INTERNAL (Word of Faith)</option>
                    <option value="WASSCE">WASSCE</option>
                    <option value="UTME">UTME</option>
                    <option value="NECO">NECO</option>
                    <option value="POST_UTME">POST-UTME</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Target Bank Isolation
                  </label>
                  <select
                    value={qBankScope}
                    onChange={(e) => setQBankScope(e.target.value as "OPEN_BANK" | "EXAM_ONLY")}
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  >
                    <option value="OPEN_BANK">OPEN_BANK (Student Practice)</option>
                    <option value="EXAM_ONLY">EXAM_ONLY (Strict Official Exam)</option>
                  </select>
                </div>
              </div>

              {qSubjectSelect === "__custom__" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Custom Subject Code (alphanumeric, e.g. `furthermaths`, `yoruba`) *
                  </label>
                  <input
                    type="text"
                    value={qCustomSubject}
                    onChange={(e) => setQCustomSubject(e.target.value)}
                    placeholder="e.g., furthermaths"
                    required
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Topic / Unit
                  </label>
                  <input
                    type="text"
                    value={qTopic}
                    onChange={(e) => setQTopic(e.target.value)}
                    placeholder="e.g., Quadratic Equations"
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Diagram Image URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={qImageUrl}
                    onChange={(e) => setQImageUrl(e.target.value)}
                    placeholder="/images/... or https://..."
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                  Question Stem *
                </label>
                <textarea
                  rows={3}
                  value={qStem}
                  onChange={(e) => setQStem(e.target.value)}
                  required
                  placeholder="Enter clear objective question text..."
                  style={{ width: "100%", padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Option A *
                  </label>
                  <input
                    type="text"
                    value={qOptionA}
                    onChange={(e) => setQOptionA(e.target.value)}
                    required
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Option B *
                  </label>
                  <input
                    type="text"
                    value={qOptionB}
                    onChange={(e) => setQOptionB(e.target.value)}
                    required
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Option C *
                  </label>
                  <input
                    type="text"
                    value={qOptionC}
                    onChange={(e) => setQOptionC(e.target.value)}
                    required
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Option D *
                  </label>
                  <input
                    type="text"
                    value={qOptionD}
                    onChange={(e) => setQOptionD(e.target.value)}
                    required
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Correct Option *
                  </label>
                  <select
                    value={qCorrectKey}
                    onChange={(e) => setQCorrectKey(e.target.value as "a" | "b" | "c" | "d")}
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)", fontWeight: 700 }}
                  >
                    <option value="a">Option A</option>
                    <option value="b">Option B</option>
                    <option value="c">Option C</option>
                    <option value="d">Option D</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                    Explanation / Marking Guide (Shown after submission)
                  </label>
                  <input
                    type="text"
                    value={qExplanation}
                    onChange={(e) => setQExplanation(e.target.value)}
                    placeholder="Concise rationale for students reviewing corrections"
                    style={{ width: "100%", padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingQuestion}
                className="btn btn-primary"
                style={{ justifyContent: "center", padding: "0.75rem 1.25rem" }}
              >
                {savingQuestion
                  ? "Saving..."
                  : editingQuestionId
                  ? "Update Question in Bank"
                  : "Save Question to School Bank"}
              </button>
            </form>

            {/* Bulk CSV Import Panel */}
            <div
              style={{
                background: "var(--color-white)",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--color-gray-200)",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--color-navy-blue)", margin: 0, display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <FiUpload /> Bulk Import via CSV
                </h2>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="btn btn-outline"
                  style={{ padding: "0.4rem 0.85rem", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <FiDownload /> Download Sample CSV
                </button>
              </div>

              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-gray-600)", lineHeight: 1.5 }}>
                Upload or paste an RFC-4180 CSV sheet with headers{" "}
                <code>subjectCode, examBody, topic, stem, optionA, optionB, optionC, optionD, correctKey, explanation</code>.
                Rows missing <code>subjectCode</code> or <code>examBody</code> inherit the defaults below.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Default Subject (Fallback)
                  </label>
                  <select
                    value={csvDefaultSubject}
                    onChange={(e) => setCsvDefaultSubject(e.target.value)}
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  >
                    {ALL_KNOWN_SUBJECTS.map((subj) => (
                      <option key={subj} value={subj}>
                        {formatCbtSubjectLabel(subj)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Default Exam Body
                  </label>
                  <select
                    value={csvDefaultExamBody}
                    onChange={(e) => setCsvDefaultExamBody(e.target.value)}
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  >
                    <option value="SCHOOL_INTERNAL">SCHOOL_INTERNAL</option>
                    <option value="WASSCE">WASSCE</option>
                    <option value="UTME">UTME</option>
                    <option value="NECO">NECO</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Target Bank Isolation
                  </label>
                  <select
                    value={csvBankScope}
                    onChange={(e) => setCsvBankScope(e.target.value as "OPEN_BANK" | "EXAM_ONLY")}
                    style={{ width: "100%", padding: "0.55rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  >
                    <option value="OPEN_BANK">OPEN_BANK (Practice)</option>
                    <option value="EXAM_ONLY">EXAM_ONLY (Official Exam)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                  Choose CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const txt = await file.text();
                    setCsvText(txt);
                  }}
                  style={{ width: "100%", fontSize: "0.85rem" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>
                  CSV Content Preview / Paste Area
                </label>
                <textarea
                  rows={6}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="subjectCode,examBody,topic,stem,optionA,optionB,optionC,optionD,correctKey,explanation"
                  style={{
                    width: "100%",
                    padding: "0.65rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-300)",
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    resize: "vertical",
                  }}
                />
              </div>

              {csvImportErrors.length > 0 && (
                <div
                  style={{
                    background: "var(--status-warning-bg)",
                    color: "var(--status-warning-text)",
                    border: "1px solid var(--status-warning-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.75rem",
                    fontSize: "0.8rem",
                    maxHeight: "140px",
                    overflowY: "auto",
                  }}
                >
                  <strong>Row Validation Notices ({csvImportErrors.length}):</strong>
                  <ul style={{ margin: "0.35rem 0 0 1.1rem", padding: 0 }}>
                    {csvImportErrors.map((err, i) => (
                      <li key={i}>
                        Row {err.rowNumber}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={handleBulkCsvImport}
                disabled={importingCsv || !csvText.trim()}
                className="btn btn-primary"
                style={{ justifyContent: "center", padding: "0.75rem 1.25rem" }}
              >
                {importingCsv ? "Importing Questions..." : "Import CSV Questions"}
              </button>
            </div>
          </div>

          {/* Pool Filter & Question List */}
          <div
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--color-navy-blue)" }}>
                  Authored School-Internal Question Bank ({bankQuestions.length} shown)
                </h3>
                {internalSubjectCounts.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.5rem" }}>
                    {internalSubjectCounts.map((c) => (
                      <span
                        key={c.subjectCode}
                        style={{
                          padding: "0.2rem 0.6rem",
                          borderRadius: "999px",
                          background: "var(--color-gray-100)",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: "var(--color-navy-blue)",
                        }}
                      >
                        {formatCbtSubjectLabel(c.subjectCode)}: {c.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={bankScopeFilter}
                  onChange={(e) => {
                    const val = e.target.value as "ALL" | "OPEN_BANK" | "EXAM_ONLY";
                    setBankScopeFilter(val);
                    refreshBankAndAnalytics({ bankScope: val });
                  }}
                  style={{ padding: "0.5rem 0.7rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                >
                  <option value="ALL">All Bank Scopes</option>
                  <option value="EXAM_ONLY">EXAM_ONLY (Confidential)</option>
                  <option value="OPEN_BANK">OPEN_BANK (Practice)</option>
                </select>

                <select
                  value={bankSubjectFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBankSubjectFilter(val);
                    refreshBankAndAnalytics({ subjectCode: val });
                  }}
                  style={{ padding: "0.5rem 0.7rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                >
                  <option value="all">All Subjects</option>
                  {Array.from(
                    new Set([
                      ...ALL_KNOWN_SUBJECTS,
                      ...internalSubjectCounts.map((c) => c.subjectCode),
                    ])
                  ).map((subj) => (
                    <option key={subj} value={subj}>
                      {formatCbtSubjectLabel(subj)}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Search stem or topic..."
                  style={{ padding: "0.5rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)", minWidth: "200px" }}
                />

                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={includeInactiveBank}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setIncludeInactiveBank(val);
                      refreshBankAndAnalytics({ includeInactive: val });
                    }}
                  />
                  Show archived
                </label>

                <button
                  type="button"
                  onClick={() => refreshBankAndAnalytics()}
                  disabled={bankLoading}
                  className="btn btn-outline"
                  style={{ padding: "0.45rem 0.9rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <FiRefreshCw /> {bankLoading ? "Loading..." : "Search"}
                </button>
              </div>
            </div>

            {bankQuestions.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                No SCHOOL_INTERNAL questions match your current filter yet. Author a question or upload a CSV sheet above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                {bankQuestions.map((q) => (
                  <div
                    key={q.id}
                    style={{
                      border: "1px solid var(--color-gray-200)",
                      borderRadius: "var(--radius-md)",
                      padding: "1rem 1.15rem",
                      background: q.isActive ? "var(--color-white)" : "var(--color-gray-50)",
                      opacity: q.isActive ? 1 : 0.78,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
                        <span style={{ padding: "0.2rem 0.55rem", borderRadius: "999px", background: "var(--color-navy-blue)", color: "#fff", fontSize: "0.75rem", fontWeight: 700 }}>
                          {formatCbtSubjectLabel(q.subjectCode)}
                        </span>
                        <span style={{ padding: "0.2rem 0.55rem", borderRadius: "999px", background: "var(--color-gray-100)", color: "var(--color-gray-700)", fontSize: "0.75rem", fontWeight: 600 }}>
                          {q.examBody}
                        </span>
                        <span
                          style={{
                            padding: "0.18rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: q.bankScope === "EXAM_ONLY" ? "var(--status-error-bg)" : "var(--status-info-bg)",
                            color: q.bankScope === "EXAM_ONLY" ? "var(--status-error-text)" : "var(--status-info-text)",
                          }}
                        >
                          {q.bankScope}
                        </span>
                        <span style={{ fontSize: "0.8rem", color: "var(--color-gray-600)" }}>
                          Topic: <strong>{q.topic}</strong>
                        </span>
                        <span
                          style={{
                            padding: "0.18rem 0.55rem",
                            borderRadius: "999px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: q.isActive ? "var(--status-success-bg)" : "var(--status-error-bg)",
                            color: q.isActive ? "var(--status-success-text)" : "var(--status-error-text)",
                          }}
                        >
                          {q.isActive ? "Active" : "Archived"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
                          Used {q.usageCount}x • {q.authorLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartEditQuestion(q)}
                          className="btn btn-outline"
                          style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <FiEdit2 /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleQuestionActive(q)}
                          disabled={bankLoading}
                          className="btn btn-outline"
                          style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        >
                          <FiArchive /> {q.isActive ? "Archive" : "Reactivate"}
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 600, color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
                      {q.stem}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "0.4rem" }}>
                      {q.options.map((opt) => {
                        const isRight = opt.key.toLowerCase() === q.correctKey;
                        return (
                          <div
                            key={opt.key}
                            style={{
                              padding: "0.4rem 0.65rem",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "0.84rem",
                              background: isRight ? "var(--status-success-bg)" : "var(--color-gray-50)",
                              color: isRight ? "var(--status-success-text)" : "var(--color-gray-700)",
                              border: `1px solid ${isRight ? "var(--status-success-border)" : "var(--color-gray-200)"}`,
                              fontWeight: isRight ? 700 : 400,
                            }}
                          >
                            <strong>{opt.key.toUpperCase()}.</strong> {opt.text}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-gray-600)" }}>
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: STRICT EXAMS & PAPER OCR STUDIO */}
      {activeTab === "exams" && <ExamBankAndSchedulerStudio mode="admin" />}

      {/* TAB 6: EXAM ANALYTICS & EXPORTS */}
      {activeTab === "analytics" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              padding: "1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.1rem", color: "var(--color-navy-blue)", margin: "0 0 0.25rem 0" }}>
                CBT Performance Analytics & CSV Exports
              </h2>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                Subject pass rates, score distributions, and formula-sanitized spreadsheet downloads across {attemptRows.length} recent CBT attempts.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={analyticsSubjectFilter}
                onChange={(e) => setAnalyticsSubjectFilter(e.target.value)}
                style={{ padding: "0.5rem 0.7rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
              >
                <option value="all">All Subjects (Attempts Export)</option>
                {subjectAnalytics.map((s) => (
                  <option key={s.subjectCode} value={s.subjectCode}>
                    {formatCbtSubjectLabel(s.subjectCode)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleExportSubjectAnalyticsCsv}
                disabled={subjectAnalytics.length === 0}
                className="btn btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.55rem 0.95rem" }}
              >
                <FiDownload /> Export Subject Summary CSV
              </button>
              <button
                type="button"
                onClick={handleExportAttemptsCsv}
                disabled={attemptRows.length === 0}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.55rem 0.95rem" }}
              >
                <FiDownload /> Export Detailed Attempts CSV
              </button>
            </div>
          </div>

          <div
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              overflowX: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
              <thead>
                <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Subject</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Total Attempts</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Submitted</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Terminated</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Avg Score</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Highest Score</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Pass Rate (≥50%)</th>
                  <th style={{ padding: "0.9rem 1rem", textAlign: "center" }}>Avg Strikes</th>
                </tr>
              </thead>
              <tbody>
                {subjectAnalytics.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                      No CBT exam attempts recorded yet.
                    </td>
                  </tr>
                ) : (
                  subjectAnalytics.map((row) => (
                    <tr key={row.subjectCode} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                        {formatCbtSubjectLabel(row.subjectCode)}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center", fontWeight: 700 }}>{row.totalAttempts}</td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center", color: "var(--status-success-text)", fontWeight: 600 }}>
                        {row.submittedCount}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center", color: row.terminatedCount > 0 ? "var(--status-error-text)" : "var(--color-gray-500)" }}>
                        {row.terminatedCount}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center", fontWeight: 700 }}>{row.avgScorePct}%</td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>{row.highestScorePct}%</td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center", fontWeight: 700 }}>{row.passRatePct}%</td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>{row.avgStrikes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
