"use client";

import { useRouter } from "next/navigation";
import { FiDownload, FiLayers, FiPrinter, FiCalendar } from "react-icons/fi";

function sanitizeCsvFormulaCell(value: unknown): string {
  const s = String(value ?? "");
  return /^[=+\-@\t\r]/.test(s.trimStart()) ? `'${s}` : s;
}

export default function BroadsheetControls({
  classId,
  mode,
  sessionName,
  sessionsAvailable,
  divisorMode,
  backHref = "/portal/dashboard",
  backLabel = "Back to Dashboard",
  csvHeaders,
  csvRows,
  csvFilename,
}: {
  classId: number;
  mode: "terminal" | "cumulative";
  sessionName: string;
  sessionsAvailable: string[];
  divisorMode: "ENTERED_TERMS" | "ALL_SESSION_TERMS";
  backHref?: string;
  backLabel?: string;
  csvHeaders: string[];
  csvRows: Array<Array<string | number | null | undefined>>;
  csvFilename: string;
}) {
  const router = useRouter();

  const navigateWith = (next: {
    mode?: "terminal" | "cumulative";
    session?: string;
    divisor?: "ENTERED_TERMS" | "ALL_SESSION_TERMS";
  }) => {
    const m = next.mode ?? mode;
    const s = next.session ?? sessionName;
    const d = next.divisor ?? divisorMode;
    const params = new URLSearchParams();
    params.set("mode", m);
    if (s) params.set("session", s);
    if (m === "cumulative") params.set("divisor", d);
    router.push(`/portal/broadsheet/${classId}?${params.toString()}`);
  };

  const handleDownloadCsv = () => {
    const csvLines = [
      csvHeaders.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(","),
      ...csvRows.map((r) =>
        r
          .map((cell) => {
            const safe = sanitizeCsvFormulaCell(cell);
            return `"${safe.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
        <a
          href={backHref}
          style={{ textDecoration: "none", color: "var(--text-heading)", fontWeight: 700, fontSize: "0.9rem" }}
        >
          &larr; {backLabel}
        </a>

        <div
          style={{
            display: "inline-flex",
            borderRadius: "8px",
            overflow: "hidden",
            border: "1px solid var(--border-primary)",
          }}
        >
          <button
            type="button"
            onClick={() => navigateWith({ mode: "terminal" })}
            style={{
              padding: "0.4rem 0.8rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              background: mode === "terminal" ? "var(--brand-secondary)" : "var(--bg-card)",
              color: mode === "terminal" ? "#ffffff" : "var(--text-primary)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <FiCalendar size={13} /> Terminal Broadsheet
          </button>
          <button
            type="button"
            onClick={() => navigateWith({ mode: "cumulative" })}
            style={{
              padding: "0.4rem 0.8rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              background: mode === "cumulative" ? "var(--brand-primary)" : "var(--bg-card)",
              color: mode === "cumulative" ? "#ffffff" : "var(--text-primary)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <FiLayers size={13} /> 3rd-Term Annual Cumulative
          </button>
        </div>

        {mode === "cumulative" && (
          <>
            <select
              value={sessionName}
              onChange={(e) => navigateWith({ session: e.target.value })}
              className="form-input"
              style={{ width: "auto", padding: "0.35rem 0.65rem", fontSize: "0.82rem", fontWeight: 600 }}
              aria-label="Academic Session"
            >
              {sessionsAvailable.map((s) => (
                <option key={s} value={s}>
                  Session: {s}
                </option>
              ))}
            </select>

            <select
              value={divisorMode}
              onChange={(e) =>
                navigateWith({
                  divisor: e.target.value as "ENTERED_TERMS" | "ALL_SESSION_TERMS",
                })
              }
              className="form-input"
              style={{ width: "auto", padding: "0.35rem 0.65rem", fontSize: "0.82rem", fontWeight: 600 }}
              aria-label="Annual Average Divisor"
            >
              <option value="ENTERED_TERMS">Divide by Terms Sat</option>
              <option value="ALL_SESSION_TERMS">Divide by Full Session Terms (&divide;3)</option>
            </select>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleDownloadCsv}
          className="btn btn-outline"
          style={{ padding: "0.45rem 0.85rem", fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
        >
          <FiDownload size={14} /> Export CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-primary"
          style={{ padding: "0.45rem 0.85rem", fontSize: "0.84rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
        >
          <FiPrinter size={14} /> Print Broadsheet
        </button>
      </div>
    </div>
  );
}
