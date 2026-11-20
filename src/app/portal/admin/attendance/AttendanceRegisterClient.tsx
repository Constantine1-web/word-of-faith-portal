"use client";

import { useState, useMemo } from "react";
import {
  getAdminSchoolAttendanceOverview,
  markAttendance,
  type AdminSchoolAttendanceOverview,
} from "@/app/actions/attendance";
import { FiDownload, FiPrinter, FiRefreshCw, FiSearch } from "react-icons/fi";

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

export default function AttendanceRegisterClient({
  initialOverview,
}: {
  initialOverview: AdminSchoolAttendanceOverview;
}) {
  const [overview, setOverview] = useState<AdminSchoolAttendanceOverview>(initialOverview);
  const [activeTab, setActiveTab] = useState<"classes" | "daily" | "warnings">("classes");

  const [selectedDate, setSelectedDate] = useState(initialOverview.selectedDate);
  const [selectedTermId, setSelectedTermId] = useState<number>(
    initialOverview.selectedTerm?.TermID || 0
  );
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [thresholdPct, setThresholdPct] = useState<number>(initialOverview.thresholdPct || 80);
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [updatingStudentId, setUpdatingStudentId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    initialOverview.success ? null : { type: "error", text: initialOverview.error || "Unable to load register." }
  );

  const reloadOverview = async (overrides?: {
    dateStr?: string;
    termId?: number;
    classId?: number;
    threshold?: number;
  }) => {
    setLoading(true);
    setMessage(null);
    const nextDate = overrides?.dateStr ?? selectedDate;
    const nextTerm = overrides?.termId ?? selectedTermId;
    const nextClass = overrides?.classId ?? selectedClassId;
    const nextThreshold = overrides?.threshold ?? thresholdPct;

    const res = await getAdminSchoolAttendanceOverview({
      dateStr: nextDate,
      termId: nextTerm > 0 ? nextTerm : undefined,
      classId: nextClass > 0 ? nextClass : undefined,
      thresholdPct: nextThreshold,
    });

    if (res.success) {
      setOverview(res);
    } else if (res.error) {
      setMessage({ type: "error", text: res.error });
    }
    setLoading(false);
  };

  const handleQuickMark = async (studentId: number, studentName: string, nextStatus: string) => {
    const activeTermId = selectedTermId || overview.selectedTerm?.TermID;
    if (!activeTermId) {
      setMessage({ type: "error", text: "No active academic term available to record attendance." });
      return;
    }

    setUpdatingStudentId(studentId);
    setMessage(null);
    const res = await markAttendance(studentId, activeTermId, selectedDate, nextStatus);
    if (res.success) {
      setMessage({
        type: "success",
        text: `Updated ${studentName} to ${nextStatus} for ${selectedDate}.`,
      });
      await reloadOverview();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to update attendance status." });
    }
    setUpdatingStudentId(null);
  };

  const filteredDailyRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return overview.dailyRegisterRows;
    return overview.dailyRegisterRows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNo.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
    );
  }, [overview.dailyRegisterRows, searchQuery]);

  const filteredWarnings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return overview.earlyWarningStudents;
    return overview.earlyWarningStudents.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNo.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
    );
  }, [overview.earlyWarningStudents, searchQuery]);

  const handleExportRegisterCsv = () => {
    downloadCsvFile(
      `wofs_daily_attendance_${overview.selectedDate}.csv`,
      ["Admission No", "Student Name", "Class", "Date", "Status", "Teacher Notes"],
      filteredDailyRows.map((r) => [
        r.admissionNo,
        r.fullName,
        r.className,
        overview.selectedDate,
        r.status,
        r.notes,
      ])
    );
  };

  const handleExportWarningsCsv = () => {
    downloadCsvFile(
      `wofs_attendance_watch_below_${overview.thresholdPct}pct.csv`,
      [
        "Admission No",
        "Student Name",
        "Class",
        "Days Marked",
        "Present",
        "Late",
        "Absent",
        "Excused",
        "Attendance Rate (%)",
        "Guardian Phone",
        "Guardian Email",
      ],
      filteredWarnings.map((w) => [
        w.admissionNo,
        w.fullName,
        w.className,
        w.totalMarked,
        w.present,
        w.late,
        w.absent,
        w.excused,
        w.attendanceRatePct,
        w.parentContact,
        w.parentEmail || "",
      ])
    );
  };

  const stats = overview.summaryStats;
  const coveragePct =
    stats.totalStudents > 0
      ? Math.round((stats.markedTodayCount / stats.totalStudents) * 100)
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {message && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius-sm)",
            background:
              message.type === "error"
                ? "var(--status-error-bg)"
                : "var(--status-success-bg)",
            color:
              message.type === "error"
                ? "var(--status-error-text)"
                : "var(--status-success-text)",
            border: `1px solid ${
              message.type === "error"
                ? "var(--status-error-border)"
                : "var(--status-success-border)"
            }`,
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Summary Metrics Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Daily Roll-Call Coverage
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-heading)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
            {coveragePct}%
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {stats.markedTodayCount} of {stats.totalStudents} pupils marked • {stats.unmarkedClassCount} unmarked class(es)
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Present / Late ({overview.selectedDate})
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-primary-green)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
            {stats.presentTodayCount}
            <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
              ({stats.lateTodayCount} late)
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {stats.excusedTodayCount} excused absence(s)
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Absences Logged
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: stats.absentTodayCount > 0 ? "var(--status-error-text)" : "var(--text-heading)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
            {stats.absentTodayCount}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Guardian absence alerts dispatched
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            Attendance Watch (&lt;{overview.thresholdPct}%)
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: stats.atRiskCount > 0 ? "var(--status-warning-text)" : "var(--text-heading)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
            {stats.atRiskCount}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {overview.selectedTerm ? `${overview.selectedTerm.SessionName} • ${overview.selectedTerm.TermName}` : "Current term"}
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.85rem",
          alignItems: "end",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              Register Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                reloadOverview({ dateStr: e.target.value });
              }}
              style={{
                padding: "0.48rem 0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              Academic Term
            </label>
            <select
              value={selectedTermId}
              onChange={(e) => {
                const tid = Number(e.target.value);
                setSelectedTermId(tid);
                reloadOverview({ termId: tid });
              }}
              style={{
                padding: "0.5rem 0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              {overview.terms.map((t) => (
                <option key={t.TermID} value={t.TermID}>
                  {t.SessionName} — {t.TermName} {t.IsActive ? "(Active)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              Class Arm
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => {
                const cid = Number(e.target.value);
                setSelectedClassId(cid);
                reloadOverview({ classId: cid });
              }}
              style={{
                padding: "0.5rem 0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              <option value={0}>All Classes</option>
              {overview.classesSummary.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.className}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              Watch Threshold
            </label>
            <select
              value={thresholdPct}
              onChange={(e) => {
                const nextT = Number(e.target.value);
                setThresholdPct(nextT);
                reloadOverview({ threshold: nextT });
              }}
              style={{
                padding: "0.5rem 0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              <option value={75}>Below 75%</option>
              <option value={80}>Below 80%</option>
              <option value={85}>Below 85%</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => reloadOverview()}
            disabled={loading}
            className="btn btn-outline"
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <FiRefreshCw /> {loading ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={activeTab === "warnings" ? handleExportWarningsCsv : handleExportRegisterCsv}
            className="btn btn-outline"
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <FiDownload /> {activeTab === "warnings" ? "Export Watch CSV" : "Export Register CSV"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-outline"
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <FiPrinter /> Print
          </button>
        </div>
      </div>

      {/* Tabs + Search */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border-primary)",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveTab("classes")}
            style={{
              background: "none",
              border: "none",
              padding: "0.7rem 0.5rem",
              fontWeight: 700,
              color: activeTab === "classes" ? "var(--color-navy-blue)" : "var(--text-muted)",
              borderBottom: activeTab === "classes" ? "2px solid var(--color-primary-green)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Class Register Status ({overview.classesSummary.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("daily")}
            style={{
              background: "none",
              border: "none",
              padding: "0.7rem 0.5rem",
              fontWeight: 700,
              color: activeTab === "daily" ? "var(--color-navy-blue)" : "var(--text-muted)",
              borderBottom: activeTab === "daily" ? "2px solid var(--color-primary-green)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Daily Student Log ({filteredDailyRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("warnings")}
            style={{
              background: "none",
              border: "none",
              padding: "0.7rem 0.5rem",
              fontWeight: 700,
              color: activeTab === "warnings" ? "var(--color-navy-blue)" : "var(--text-muted)",
              borderBottom: activeTab === "warnings" ? "2px solid var(--color-primary-green)" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            Truancy Early Warning ({filteredWarnings.length})
          </button>
        </div>

        {activeTab !== "classes" && (
          <div style={{ position: "relative", paddingBottom: "0.4rem" }}>
            <FiSearch
              size={14}
              style={{ position: "absolute", left: "0.65rem", top: "0.62rem", color: "var(--text-muted)" }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by student or WOFS ID..."
              style={{
                padding: "0.42rem 0.7rem 0.42rem 2rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-primary)",
                fontSize: "0.85rem",
                minWidth: "230px",
              }}
            />
          </div>
        )}
      </div>

      {/* TAB 1: CLASS COVERAGE MATRIX */}
      {activeTab === "classes" && (
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)", textAlign: "left" }}>
                <th style={{ padding: "0.85rem 1rem" }}>Class Arm</th>
                <th style={{ padding: "0.85rem 1rem" }}>Form Master</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Enrolled</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Marked</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Present</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Late</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Absent</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Roll-Call Status</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {overview.classesSummary.map((row) => {
                const statusLabel =
                  row.enrolledCount === 0
                    ? "Empty"
                    : row.markedCount === row.enrolledCount
                    ? "Complete"
                    : row.markedCount > 0
                    ? "Partial"
                    : "Not Marked";
                return (
                  <tr key={row.classId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.8rem 1rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                      {row.className}
                      <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)" }}>{row.level}</div>
                    </td>
                    <td style={{ padding: "0.8rem 1rem", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                      {row.formMasterEmail || "Not Assigned"}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.enrolledCount}</td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {row.markedCount}/{row.enrolledCount}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "var(--status-success-text)", fontWeight: 600 }}>
                      {row.presentCount}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{row.lateCount}</td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums", color: row.absentCount > 0 ? "var(--status-error-text)" : "var(--text-muted)", fontWeight: row.absentCount > 0 ? 700 : 400 }}>
                      {row.absentCount}
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.55rem",
                          borderRadius: "4px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          border: "1px solid",
                          background:
                            statusLabel === "Complete"
                              ? "var(--status-success-bg)"
                              : statusLabel === "Partial"
                              ? "var(--status-warning-bg)"
                              : statusLabel === "Not Marked"
                              ? "var(--status-error-bg)"
                              : "var(--bg-secondary)",
                          color:
                            statusLabel === "Complete"
                              ? "var(--status-success-text)"
                              : statusLabel === "Partial"
                              ? "var(--status-warning-text)"
                              : statusLabel === "Not Marked"
                              ? "var(--status-error-text)"
                              : "var(--text-muted)",
                          borderColor:
                            statusLabel === "Complete"
                              ? "var(--status-success-border)"
                              : statusLabel === "Partial"
                              ? "var(--status-warning-border)"
                              : statusLabel === "Not Marked"
                              ? "var(--status-error-border)"
                              : "var(--border-primary)",
                        }}
                      >
                        {statusLabel} ({row.completionPct}%)
                      </span>
                    </td>
                    <td style={{ padding: "0.8rem 1rem", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClassId(row.classId);
                          setActiveTab("daily");
                          reloadOverview({ classId: row.classId });
                        }}
                        className="btn btn-outline"
                        style={{ padding: "0.32rem 0.7rem", fontSize: "0.8rem" }}
                      >
                        Open Roster
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: DAILY STUDENT LOG WITH ADMIN QUICK OVERRIDE */}
      {activeTab === "daily" && (
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "740px", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)", textAlign: "left" }}>
                <th style={{ padding: "0.85rem 1rem" }}>Student ID</th>
                <th style={{ padding: "0.85rem 1rem" }}>Student Name</th>
                <th style={{ padding: "0.85rem 1rem" }}>Class</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Current Status</th>
                <th style={{ padding: "0.85rem 1rem" }}>Teacher Note</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Record / Update</th>
              </tr>
            </thead>
            <tbody>
              {filteredDailyRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                    No active students match the selected class/filter.
                  </td>
                </tr>
              ) : (
                filteredDailyRows.map((row) => (
                  <tr key={row.studentId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontSize: "0.84rem" }}>
                      {row.admissionNo}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--text-heading)" }}>
                      {row.fullName}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>{row.className}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.55rem",
                          borderRadius: "4px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          border: "1px solid",
                          background:
                            row.status === "Present"
                              ? "var(--status-success-bg)"
                              : row.status === "Absent"
                              ? "var(--status-error-bg)"
                              : row.status === "Late" || row.status === "Excused"
                              ? "var(--status-warning-bg)"
                              : "var(--bg-secondary)",
                          color:
                            row.status === "Present"
                              ? "var(--status-success-text)"
                              : row.status === "Absent"
                              ? "var(--status-error-text)"
                              : row.status === "Late" || row.status === "Excused"
                              ? "var(--status-warning-text)"
                              : "var(--text-muted)",
                          borderColor:
                            row.status === "Present"
                              ? "var(--status-success-border)"
                              : row.status === "Absent"
                              ? "var(--status-error-border)"
                              : row.status === "Late" || row.status === "Excused"
                              ? "var(--status-warning-border)"
                              : "var(--border-primary)",
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {row.notes || "—"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      <select
                        value={row.status === "Unmarked" ? "" : row.status}
                        disabled={updatingStudentId === row.studentId}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleQuickMark(row.studentId, row.fullName, e.target.value);
                          }
                        }}
                        style={{
                          padding: "0.35rem 0.6rem",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-primary)",
                          fontSize: "0.82rem",
                          background: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <option value="">Set status...</option>
                        <option value="Present">Present</option>
                        <option value="Late">Late</option>
                        <option value="Excused">Excused</option>
                        <option value="Absent">Absent</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: CHRONIC ABSENCE EARLY WARNING */}
      {activeTab === "warnings" && (
        <div
          style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "780px", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border-primary)", textAlign: "left" }}>
                <th style={{ padding: "0.85rem 1rem" }}>Student ID</th>
                <th style={{ padding: "0.85rem 1rem" }}>Student Name</th>
                <th style={{ padding: "0.85rem 1rem" }}>Class</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Marked Days</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Absent</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Late</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Attendance %</th>
                <th style={{ padding: "0.85rem 1rem" }}>Guardian Contact</th>
              </tr>
            </thead>
            <tbody>
              {filteredWarnings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                    No active students currently fall below the {overview.thresholdPct}% attendance threshold in this term.
                  </td>
                </tr>
              ) : (
                filteredWarnings.map((w) => (
                  <tr key={w.studentId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontSize: "0.84rem" }}>
                      {w.admissionNo}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--text-heading)" }}>
                      {w.fullName}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>{w.className}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{w.totalMarked}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "var(--status-error-text)", fontWeight: 700 }}>
                      {w.absent}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{w.late}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "var(--status-error-text)" }}>
                      {w.attendanceRatePct}%
                    </td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.83rem" }}>
                      <div>{w.parentContact}</div>
                      {w.parentEmail && (
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{w.parentEmail}</div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
