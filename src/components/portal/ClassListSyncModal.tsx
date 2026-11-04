"use client";

import { useState } from "react";
import { previewClassListPdf, commitClassListSync } from "@/app/actions/classes";
import { ParsedClassListRow } from "@/lib/pdf-classlist";
import styles from "./ClassListSyncModal.module.css";
import {
  FiUploadCloud,
  FiCheckCircle,
  FiAlertTriangle,
  FiX,
  FiUsers,
  FiPrinter,
  FiCopy,
  FiCheck,
  FiFileText,
} from "react-icons/fi";

interface ClassListSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassId?: number;
  classes: Array<{ ClassID: number; ClassName: string; Level?: string; Arm?: string }>;
  onSuccess?: () => void;
}

export default function ClassListSyncModal({
  isOpen,
  onClose,
  initialClassId,
  classes,
  onSuccess,
}: ClassListSyncModalProps) {
  const [selectedClassId, setSelectedClassId] = useState<number>(
    initialClassId || (classes.length > 0 ? classes[0].ClassID : 1)
  );

  const [step, setStep] = useState<1 | 2 | 3>(1); // 1 = Upload, 2 = Verify & Match, 3 = Completed & Slips
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedClassListRow[]>([]);
  const [classInfo, setClassInfo] = useState<{ id: number; name: string } | null>(null);
  const [syncSummary, setSyncSummary] = useState<any>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!isOpen) return null;

  const currentClass = classes.find((c) => c.ClassID === selectedClassId);

  const handleAnalyzePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("classId", String(selectedClassId));

    const res: any = await previewClassListPdf(formData);

    if (res.success && res.rows) {
      setParsedRows(res.rows);
      setClassInfo(res.classInfo || { id: selectedClassId, name: currentClass?.ClassName || "Selected Class" });
      setStep(2);
    } else {
      setError(res.error || "Failed to parse PDF class list.");
    }
    setLoading(false);
  };

  const handleToggleRow = (tempId: string) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleNameChange = (tempId: string, newName: string) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, cleanName: newName } : r))
    );
  };

  const handleCommitSync = async () => {
    const activeCount = parsedRows.filter((r) => r.selected).length;
    if (activeCount === 0) {
      setError("Please select at least one student to synchronize.");
      return;
    }

    const confirmMsg = `Are you sure you want to enroll ${activeCount} pupils into ${
      classInfo?.name || currentClass?.ClassName
    } for this academic term?`;
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    setError("");

    const res = await commitClassListSync(selectedClassId, parsedRows);

    if (res.success) {
      setSyncSummary(res);
      setStep(3);
      if (onSuccess) onSuccess();
    } else {
      setError(res.error || "Failed to commit class list synchronization.");
    }
    setLoading(false);
  };

  const handleCopySlips = () => {
    if (!syncSummary?.claimSlips?.length) return;
    const text = syncSummary.claimSlips
      .map(
        (s: any) =>
          `Student: ${s.name}\nClass: ${s.className}\nReg No: ${s.admissionNo}\nClaim Code: ${s.claimCode}\nRegister: https://wofs.vercel.app/portal/register\n---`
      )
      .join("\n\n");

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handlePrintSlips = () => {
    window.print();
  };

  const activeSelectedCount = parsedRows.filter((r) => r.selected).length;
  const existingMatchedCount = parsedRows.filter((r) => r.selected && r.isExisting).length;
  const newPupilsCount = parsedRows.filter((r) => r.selected && !r.isExisting).length;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2>
            <FiUsers /> Smart Class List PDF Synchronization
          </h2>
          <button onClick={onClose} className={styles.closeBtn} title="Close modal">
            <FiX />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {error && (
            <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.9rem" }}>
              {error}
            </div>
          )}

          {/* Scope Banner: guarantees class-arm isolation */}
          <div className={styles.scopeBanner}>
            <div>
              <span style={{ fontSize: "0.8rem", color: "#166534", display: "block" }}>Target Class Arm (Isolated Roster):</span>
              <strong style={{ fontSize: "1.05rem", color: "#143424" }}>
                {classInfo?.name || currentClass?.ClassName || "Select Class Arm"}
              </strong>
            </div>

            {step === 1 && classes.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", color: "#4b5563" }}>Change Class:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(parseInt(e.target.value))}
                  style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.85rem" }}
                >
                  {classes.map((c) => (
                    <option key={c.ClassID} value={c.ClassID}>
                      {c.ClassName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <span className={styles.scopeBadge}>Term 2026/2027</span>
          </div>

          {/* Step 1: Upload PDF */}
          {step === 1 && (
            <form onSubmit={handleAnalyzePdf}>
              <div
                className={styles.dropzone}
                onClick={() => document.getElementById("pdfInput")?.click()}
              >
                <FiUploadCloud style={{ fontSize: "3rem", color: "#143424", marginBottom: "0.75rem" }} />
                <h3 style={{ margin: "0 0 0.5rem 0", color: "#143424" }}>
                  {file ? file.name : "Select or Drop Class List PDF"}
                </h3>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                  Upload a PDF roster for <strong>{currentClass?.ClassName}</strong>. The system will extract names and automatically match existing registration numbers.
                </p>
                <input
                  id="pdfInput"
                  type="file"
                  accept="application/pdf"
                  required
                  style={{ display: "none" }}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>

              <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="btn btn-primary"
                  style={{ padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                  <FiFileText /> {loading ? "Analyzing PDF Roster..." : "Analyze & Match Pupils"}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Interactive Verification & Pre-Commit Table */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div>
                  <h4 style={{ margin: "0 0 0.25rem 0", color: "#143424" }}>
                    Review Matched Pupils ({activeSelectedCount} selected)
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
                    Verify names and registration numbers before committing to {classInfo?.name}.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <span className={styles.badgeExisting}>
                    <FiCheck /> {existingMatchedCount} Matched Existing
                  </span>
                  <span className={styles.badgeNew}>
                    <FiUsers /> {newPupilsCount} New Sequential
                  </span>
                </div>
              </div>

              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: "40px", textAlign: "center" }}>Enroll</th>
                      <th style={{ width: "35%" }}>Pupil Name</th>
                      <th>Match Classification</th>
                      <th>Permanent Registration No</th>
                      <th>Claim Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr key={row.tempId} style={{ opacity: row.selected ? 1 : 0.5, background: row.selected ? "transparent" : "#f9fafb" }}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleToggleRow(row.tempId)}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.cleanName}
                            onChange={(e) => handleNameChange(row.tempId, e.target.value)}
                            className={styles.inputName}
                            disabled={!row.selected}
                          />
                        </td>
                        <td>
                          {row.isExisting ? (
                            <span className={styles.badgeExisting}>
                              <FiCheck /> Existing Student Matched
                            </span>
                          ) : (
                            <span className={styles.badgeNew}>
                              <FiUsers /> New Pupil Enrolled
                            </span>
                          )}
                        </td>
                        <td>
                          <strong style={{ fontFamily: "monospace", color: row.isExisting ? "#15803d" : "#1e40af" }}>
                            {row.admissionNo}
                          </strong>
                        </td>
                        <td>
                          {row.claimCode ? (
                            <span style={{ fontFamily: "monospace", background: "#fef3c7", color: "#92400e", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem" }}>
                              {row.claimCode}
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>Account Active / Linked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Success Breakdown & Claim Slips */}
          {step === 3 && syncSummary && (
            <div>
              <div style={{ textAlign: "center", padding: "1rem 0 1.5rem" }}>
                <div style={{ width: "64px", height: "64px", background: "#dcfce7", color: "#166534", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", margin: "0 auto 1rem" }}>
                  <FiCheckCircle />
                </div>
                <h3 style={{ margin: "0 0 0.5rem 0", color: "#143424" }}>
                  Class List Synchronized Successfully!
                </h3>
                <p style={{ margin: 0, color: "#4b5563" }}>
                  Enrolled <strong>{syncSummary.totalProcessed} pupils</strong> into <strong>{syncSummary.className}</strong>.
                  ({syncSummary.matchedCount} existing students updated · {syncSummary.newPupilsCount} new pupils registered).
                </p>
              </div>

              {syncSummary.claimSlips?.length > 0 ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
                    <div>
                      <h4 style={{ margin: 0, color: "#143424" }}>One-Time Claim Slips for New Pupils</h4>
                      <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
                        Give these codes to parents so students can claim their portal accounts.
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={handleCopySlips}
                        className="btn btn-outline"
                        style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        {copiedAll ? <FiCheck /> : <FiCopy />} {copiedAll ? "Copied All!" : "Copy Slips"}
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintSlips}
                        className="btn btn-primary"
                        style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <FiPrinter /> Print Slips
                      </button>
                    </div>
                  </div>

                  <div className={styles.slipGrid}>
                    {syncSummary.claimSlips.map((slip: any, idx: number) => (
                      <div key={idx} className={styles.slipCard}>
                        <div style={{ fontSize: "0.75rem", color: "#166534", textTransform: "uppercase", fontWeight: "bold" }}>
                          {slip.className}
                        </div>
                        <h4 style={{ margin: "0.25rem 0", color: "#111827", fontSize: "1rem" }}>{slip.name}</h4>
                        <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
                          Reg: <strong>{slip.admissionNo}</strong>
                        </div>
                        <div className={styles.slipCode}>{slip.claimCode}</div>
                        <div style={{ fontSize: "0.75rem", color: "#059669" }}>
                          Register at: <code>/portal/register</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ background: "#f0fdf4", padding: "1rem", borderRadius: "8px", textAlign: "center", color: "#15803d", fontSize: "0.95rem" }}>
                  All pupils in this list were matched to existing accounts. No new claim slips needed.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className={styles.footer}>
          {step === 1 && (
            <>
              <button type="button" onClick={onClose} className="btn btn-outline" style={{ padding: "0.5rem 1rem" }}>
                Cancel
              </button>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Supported format: PDF documents</span>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="btn btn-outline"
                style={{ padding: "0.5rem 1rem" }}
              >
                Back to File Upload
              </button>

              <button
                type="button"
                onClick={handleCommitSync}
                disabled={loading || activeSelectedCount === 0}
                className="btn btn-primary"
                style={{ padding: "0.6rem 1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <FiCheckCircle /> {loading ? "Enrolling Pupils..." : `Confirm & Enroll ${activeSelectedCount} Pupils`}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div />
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary"
                style={{ padding: "0.6rem 1.5rem" }}
              >
                Done & Return
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
