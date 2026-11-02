"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FiPrinter,
  FiCheckCircle,
  FiUploadCloud,
  FiLayers,
  FiUnlock,
  FiCpu,
  FiSend,
  FiAlertTriangle,
} from "react-icons/fi";
import {
  uploadManualResult,
  uploadBulkResults,
  computeClassBroadsheetAction,
  signOffClassBroadsheetAction,
  publishClassBroadsheetAction,
  approveSubjectSheetUnlock,
} from "@/app/actions/results";

export default function AdminResultsClient({
  classes: initialClasses,
  subjects,
  activeTerm,
}: {
  classes: any[];
  subjects: any[];
  activeTerm: any;
}) {
  const [classes, setClasses] = useState(initialClasses);
  const [activeTab, setActiveTab] = useState<"broadsheets" | "unlocks" | "upload">("broadsheets");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

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
          "Enter change reason for superseding previous ReportCard version (Section B.4.6):",
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
      "Enter mandatory written reason to unlock this sheet for 24 hours (Section B.4.1 & SoD):",
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

  return (
    <div>
      {message && (
        <div
          style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            borderRadius: "var(--radius-md)",
            background: message.type === "error" ? "#fee2e2" : "#dcfce7",
            color: message.type === "error" ? "#b91c1c" : "#15803d",
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
                <th style={{ padding: "1rem", textAlign: "left" }}>Class Arm</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Designated Form Master</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Enrolled</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Sheet Status</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Broadsheet State (B.4.5)</th>
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
                      <td data-label="Form Master" style={{ padding: "1rem", color: "var(--color-gray-700)" }}>
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
                            background: isAllSubmitted ? "#dcfce7" : "#fef3c7",
                            color: isAllSubmitted ? "#15803d" : "#b45309",
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
                                  ? "#dcfce7"
                                  : bsStatus === "SIGNED_OFF"
                                  ? "#ede9fe"
                                  : bsStatus === "COMPUTED"
                                  ? "#dbeafe"
                                  : "#f3f4f6",
                              color:
                                bsStatus === "PUBLISHED"
                                  ? "#15803d"
                                  : bsStatus === "SIGNED_OFF"
                                  ? "#6d28d9"
                                  : bsStatus === "COMPUTED"
                                  ? "#1d4ed8"
                                  : "#4b5563",
                            }}
                          >
                            {bsStatus} {bs?.computeVersion ? `(v${bs.computeVersion})` : ""}
                          </span>
                          {isStale && (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                color: "#b91c1c",
                                background: "#fee2e2",
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
                              borderColor: "#6d28d9",
                              color: "#6d28d9",
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
                <th style={{ padding: "1rem", textAlign: "left" }}>Class Arm & Subject</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Assigned Teacher</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Current Status</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Unlock Request Reason</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Action (Requires UNLOCK_SHEETS)</th>
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
                          background: sheet.Status === "Draft" ? "#f3f4f6" : "#fef3c7",
                          color: sheet.Status === "Draft" ? "#374151" : "#b45309",
                        }}
                      >
                        {sheet.Status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem", fontSize: "0.88rem", color: "var(--color-gray-700)" }}>
                      {sheet.UnlockRequestedReason || sheet.UnlockedReason || (
                        <span style={{ color: "var(--color-gray-400)", fontStyle: "italic" }}>
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
                            borderColor: "#b45309",
                            color: "#b45309",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <FiUnlock /> Unlock (24h Window)
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.82rem", color: "#15803d", fontWeight: 600 }}>
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
        <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "1fr 1fr" }}>
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
              Upload a spreadsheet with scores. Format: <code>AdmissionNo, SubjectName, CAScore, ExamScore</code>
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
                <label className="form-label">Student Admission Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. WOFS/2026/SEC/001"
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
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
    </div>
  );
}
