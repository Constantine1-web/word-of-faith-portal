"use client";

import { useState } from "react";
import { liftCbtDayLock, syncSubjectQuestionPool, getCbtProviderDiagnostics } from "@/app/actions/cbt";
import { FiShield, FiUnlock, FiAlertTriangle, FiActivity, FiCheckCircle, FiDatabase, FiRefreshCw } from "react-icons/fi";

export default function AdminCbtClient({
  initialActiveLocks,
  initialRecentAttempts,
  initialRecentEvents,
  initialProviderDiagnostics,
}: {
  initialActiveLocks: any[];
  initialRecentAttempts: any[];
  initialRecentEvents: any[];
  initialProviderDiagnostics?: any;
}) {
  const [activeLocks, setActiveLocks] = useState(initialActiveLocks);
  const [recentAttempts] = useState(initialRecentAttempts);
  const [recentEvents] = useState(initialRecentEvents);
  const [providerDiag, setProviderDiag] = useState<any>(initialProviderDiagnostics);
  const [activeTab, setActiveTab] = useState<"locks" | "attempts" | "events" | "providers">("locks");
  const [loading, setLoading] = useState(false);
  const [syncingSubject, setSyncingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

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
            background: message.type === "error" ? "#fee2e2" : "#dcfce7",
            color: message.type === "error" ? "#b91c1c" : "#15803d",
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
            background: "var(--color-white)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
            ACTIVE DAY LOCKS (2-STRIKE POLICY)
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: activeLocks.length > 0 ? "#b91c1c" : "#15803d" }}>
            {activeLocks.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
            RECENT CBT ATTEMPTS
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--color-navy-blue)" }}>
            {recentAttempts.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
            INTEGRITY TELEMETRY EVENTS
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#b45309" }}>
            {recentEvents.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
            CACHED CBT QUESTION POOL
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#15803d" }}>
            {providerDiag?.totalCachedQuestions ?? 0}
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
                  <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                    <FiCheckCircle style={{ marginRight: "0.4rem", color: "#15803d" }} />
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
                    <tr key={lock.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                      <td style={{ padding: "1rem", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                        {studentName} ({lock.student?.AdmissionNo})
                      </td>
                      <td style={{ padding: "1rem" }}>{lock.student?.Class?.ClassName || "—"}</td>
                      <td style={{ padding: "1rem", textAlign: "center", fontFamily: "monospace", fontWeight: 700 }}>
                        {lock.dayKey}
                      </td>
                      <td style={{ padding: "1rem", color: "#b91c1c", fontSize: "0.88rem" }}>{lock.reason}</td>
                      <td style={{ padding: "1rem", textAlign: "right" }}>
                        <button
                          onClick={() => handleLiftLock(lock.id, studentName)}
                          disabled={loading}
                          className="btn btn-outline"
                          style={{
                            padding: "0.4rem 0.85rem",
                            fontSize: "0.82rem",
                            borderColor: "#15803d",
                            color: "#15803d",
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
                              ? "#dcfce7"
                              : att.status === "TERMINATED"
                              ? "#fee2e2"
                              : "#dbeafe",
                          color:
                            att.status === "SUBMITTED"
                              ? "#15803d"
                              : att.status === "TERMINATED"
                              ? "#b91c1c"
                              : "#1d4ed8",
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
                        color: att.hardStrikes > 0 ? "#b91c1c" : "#15803d",
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
                          background: ev.isHard ? "#fee2e2" : "#fef3c7",
                          color: ev.isHard ? "#b91c1c" : "#b45309",
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
              <div style={{ padding: "1rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--color-gray-500)", fontWeight: 700 }}>
                  ALOC_API_KEY (Primary v1 + v2)
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: providerDiag?.diagnostics?.alocConfigured ? "#15803d" : "#b91c1c", marginTop: "0.25rem" }}>
                  {providerDiag?.diagnostics?.alocConfigured ? `Operational (${providerDiag.diagnostics.alocKeyPreview})` : "Missing"}
                </div>
              </div>

              <div style={{ padding: "1rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--color-gray-500)", fontWeight: 700 }}>
                  SDASH_API_KEY (Secondary Cloud)
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: providerDiag?.diagnostics?.sdashConfigured ? "#15803d" : "#b45309", marginTop: "0.25rem" }}>
                  {providerDiag?.diagnostics?.sdashConfigured ? `Operational (${providerDiag.diagnostics.sdashKeyPreview})` : "Fallback Only"}
                </div>
              </div>

              <div style={{ padding: "1rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--color-gray-500)", fontWeight: 700 }}>
                  GEMINI AI TUTOR KEY
                </div>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: providerDiag?.diagnostics?.geminiConfigured ? "#15803d" : "#b45309", marginTop: "0.25rem" }}>
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
                          background: row.cachedCount > 0 ? "#dcfce7" : "#dbeafe",
                          color: row.cachedCount > 0 ? "#15803d" : "#1d4ed8",
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
    </div>
  );
}
