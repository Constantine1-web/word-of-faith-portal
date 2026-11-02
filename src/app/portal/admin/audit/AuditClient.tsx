"use client";

import { useState, useTransition } from "react";
import {
  FiShield,
  FiSearch,
  FiDownload,
  FiCheckCircle,
  FiAlertTriangle,
  FiHash,
  FiEye,
  FiRefreshCw,
} from "react-icons/fi";
import {
  getAuditLogExplorerData,
  verifyAuditHashChain,
  exportAuditLogCsv,
} from "@/app/actions/admin";

interface AuditClientProps {
  initialLogs: any[];
  initialActions: string[];
}

export default function AuditClient({
  initialLogs,
  initialActions,
}: AuditClientProps) {
  const [logs, setLogs] = useState<any[]>(initialLogs);
  const [actions] = useState<string[]>(initialActions);
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [chainResult, setChainResult] = useState<{
    isIntact: boolean;
    totalChecked: number;
    hashedCount: number;
    verifiedLinks: number;
    brokenCount: number;
    brokenLinks: { id: string; expectedPrevHash: string; actualPrevHash: string | null }[];
  } | null>(null);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFilter = () => {
    startTransition(async () => {
      const res = await getAuditLogExplorerData({
        actionFilter: selectedAction,
        search: searchQuery,
        limit: 150,
      });
      if (res.success && res.logs) {
        setLogs(res.logs);
      }
    });
  };

  const handleVerifyChain = () => {
    startTransition(async () => {
      const res = await verifyAuditHashChain();
      if (res.success && typeof res.isIntact === "boolean") {
        setChainResult({
          isIntact: res.isIntact,
          totalChecked: res.totalChecked ?? 0,
          hashedCount: res.hashedCount ?? 0,
          verifiedLinks: res.verifiedLinks ?? 0,
          brokenCount: res.brokenCount ?? 0,
          brokenLinks: res.brokenLinks ?? [],
        });
      }
    });
  };

  const handleExportCsv = () => {
    startTransition(async () => {
      const res = await exportAuditLogCsv();
      if (res.success && res.csv) {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.fileName || "WOFS_Audit_Log.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Action Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "var(--color-white)",
          padding: "1.25rem",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-gray-200)",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flex: 1, minWidth: "260px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
            <FiSearch
              style={{
                position: "absolute",
                left: "0.9rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-gray-400)",
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFilter()}
              placeholder="Search Action, Entity, EntityID, or Reason..."
              className="form-input"
              style={{ paddingLeft: "2.4rem" }}
            />
          </div>

          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "180px" }}
          >
            <option value="ALL">All Actions ({actions.length})</option>
            {actions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>

          <button
            onClick={handleFilter}
            disabled={isPending}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiRefreshCw /> Filter
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
          <button
            onClick={handleVerifyChain}
            disabled={isPending}
            className="btn btn-outline"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              borderColor: "var(--color-navy-blue)",
              color: "var(--color-navy-blue)",
              fontWeight: 700,
            }}
          >
            <FiHash /> Verify SHA-256 Chain
          </button>
          <button
            onClick={handleExportCsv}
            disabled={isPending}
            className="btn btn-outline"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiDownload /> Export Audited CSV
          </button>
        </div>
      </div>

      {/* Hash Chain Verification Banner */}
      {chainResult && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius-md)",
            background: chainResult.isIntact ? "#dcfce7" : "#fee2e2",
            color: chainResult.isIntact ? "#15803d" : "#b91c1c",
            border: `1px solid ${chainResult.isIntact ? "#86efac" : "#fca5a5"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {chainResult.isIntact ? <FiCheckCircle size={20} /> : <FiAlertTriangle size={20} />}
            <div>
              <div style={{ fontWeight: 800 }}>
                {chainResult.isIntact
                  ? `Cryptographic SHA-256 Hash Chain Intact (${chainResult.verifiedLinks} verified links across ${chainResult.totalChecked} entries)`
                  : `Hash Chain Discontinuity Detected (${chainResult.brokenCount} broken link(s))`}
              </div>
              <div style={{ fontSize: "0.84rem", opacity: 0.9 }}>
                {chainResult.isIntact
                  ? "Every inspected AuditLog entry's PrevHash matches its predecessor's SHA-256 digest."
                  : `First broken entry ID: ${chainResult.brokenLinks[0]?.id || "unknown"}`}
              </div>
            </div>
          </div>
          <button
            onClick={() => setChainResult(null)}
            style={{
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              cursor: "pointer",
              fontWeight: 700,
              color: "inherit",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Audit Log Table */}
      <div
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-gray-200)",
          overflowX: "auto",
        }}
      >
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Timestamp</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Action</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Actor</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Entity</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Reason</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>SHA-256 Digest</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "right" }}>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  <FiShield style={{ marginRight: "0.4rem" }} />
                  No audit log entries match the current filter.
                </td>
              </tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.82rem", color: "var(--color-gray-600)" }}>
                    {new Date(log.CreatedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", fontWeight: 700, color: "var(--color-navy-blue)" }}>
                    {log.Action}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>
                    <div style={{ fontWeight: 600 }}>{log.actorEmail}</div>
                    {log.OnBehalfOfID && (
                      <div style={{ fontSize: "0.75rem", color: "#b45309" }}>
                        On behalf of #{log.OnBehalfOfID}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.85rem" }}>
                    <strong>{log.Entity}</strong>
                    {log.EntityID && (
                      <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
                        #{log.EntityID}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontSize: "0.84rem", maxWidth: "240px" }}>
                    {log.Reason || "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", fontFamily: "monospace", fontSize: "0.78rem", color: "var(--color-gray-600)" }}>
                    {log.Hash ? `${String(log.Hash).slice(0, 12)}...` : "—"}
                  </td>
                  <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="btn btn-outline"
                      style={{ padding: "0.3rem 0.65rem", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <FiEye /> Payload
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Modal */}
      {selectedLog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              padding: "1.75rem",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
                  Audit Entry #{selectedLog.id}
                </h3>
                <div style={{ fontSize: "0.82rem", color: "var(--color-gray-500)" }}>
                  {new Date(selectedLog.CreatedAt).toLocaleString()} · {selectedLog.Action}
                </div>
              </div>
              <button className="btn btn-outline" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem", fontSize: "0.8rem" }}>
              <div style={{ padding: "0.75rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-md)" }}>
                <div style={{ color: "var(--color-gray-500)", fontWeight: 700 }}>PrevHash</div>
                <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  {selectedLog.PrevHash || "GENESIS"}
                </div>
              </div>
              <div style={{ padding: "0.75rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-md)" }}>
                <div style={{ color: "var(--color-gray-500)", fontWeight: 700 }}>SHA-256 Hash</div>
                <div style={{ fontFamily: "monospace", wordBreak: "break-all", color: "var(--color-primary-green)", fontWeight: 700 }}>
                  {selectedLog.Hash || "—"}
                </div>
              </div>
            </div>

            {selectedLog.OldValue && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-gray-500)", marginBottom: "0.35rem" }}>
                  OLD VALUE (BEFORE)
                </div>
                <pre style={{ background: "#0f172a", color: "#f8fafc", padding: "0.85rem", borderRadius: "var(--radius-md)", fontSize: "0.78rem", overflowX: "auto" }}>
                  {JSON.stringify(selectedLog.OldValue, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.NewValue && (
              <div>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-gray-500)", marginBottom: "0.35rem" }}>
                  NEW VALUE (AFTER)
                </div>
                <pre style={{ background: "#0f172a", color: "#86efac", padding: "0.85rem", borderRadius: "var(--radius-md)", fontSize: "0.78rem", overflowX: "auto" }}>
                  {JSON.stringify(selectedLog.NewValue, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
