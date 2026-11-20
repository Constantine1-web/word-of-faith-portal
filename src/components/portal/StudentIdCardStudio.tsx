"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { FiPrinter, FiX, FiExternalLink, FiShield, FiRefreshCw } from "react-icons/fi";
import QrCodeSvg from "./QrCodeSvg";

export interface StudentIdCardRecord {
  StudentID?: number;
  AdmissionNo: string;
  FirstName?: string | null;
  MiddleName?: string | null;
  LastName?: string | null;
  PreferredName?: string | null;
  AvatarUrl?: string | null;
  EnrolmentStatus?: string | null;
  Class?: { ClassName?: string | null; Level?: string | null } | null;
  className?: string | null;
  classLevel?: string | null;
}

function resolveDisplayName(st: StudentIdCardRecord): string {
  const joined = `${st.FirstName || ""} ${st.MiddleName || ""} ${st.LastName || ""}`
    .replace(/\s+/g, " ")
    .trim();
  return joined || st.PreferredName || st.AdmissionNo;
}

function resolveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0] || "W").slice(0, 2).toUpperCase();
}

function StatusChip({ status }: { status: string }) {
  const upper = (status || "ACTIVE").toUpperCase();
  const isActive = upper === "ACTIVE";
  const isGraduated = upper === "GRADUATED";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1.5px 6px",
        borderRadius: "999px",
        fontSize: "7.5px",
        fontWeight: 800,
        letterSpacing: "0.04em",
        background: isActive ? "#dcfce7" : isGraduated ? "#dbeafe" : "#fee2e2",
        color: isActive ? "#14532d" : isGraduated ? "#1e40af" : "#991b1b",
        border: `1px solid ${isActive ? "#86efac" : isGraduated ? "#93c5fd" : "#fca5a5"}`,
      }}
    >
      {upper}
    </span>
  );
}

function Cr80FrontFace({
  student,
  verifyUrl,
  sessionLabel,
}: {
  student: StudentIdCardRecord;
  verifyUrl: string;
  sessionLabel: string;
}) {
  const fullName = resolveDisplayName(student);
  const className = student.Class?.ClassName || student.className || "Assigned Class";
  const level = student.Class?.Level || student.classLevel || "School";
  const status = (student.EnrolmentStatus || "ACTIVE").toUpperCase();
  const initials = resolveInitials(fullName);

  return (
    <div
      className="cr80-card-face"
      style={{
        width: "85.6mm",
        height: "53.98mm",
        borderRadius: "3.2mm",
        overflow: "hidden",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        boxShadow: "0 6px 18px rgba(10, 37, 64, 0.14)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        color: "#0f172a",
        fontFamily: "var(--font-primary), 'Segoe UI', Arial, sans-serif",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      {/* Top Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
          color: "#ffffff",
          padding: "2.2mm 3.2mm",
          borderBottom: "2px solid #D4AF37",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "2mm",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "2mm", minWidth: 0 }}>
          <img
            src="/logo.jpg"
            alt="WOFS"
            style={{
              width: "7.5mm",
              height: "7.5mm",
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid #D4AF37",
              background: "#ffffff",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "8.5px", fontWeight: 900, letterSpacing: "0.05em", lineHeight: 1.1 }}>
              WORD OF FAITH SCHOOLS
            </div>
            <div style={{ fontSize: "6.5px", color: "#bbf7d0", fontWeight: 700, letterSpacing: "0.06em" }}>
              OFFICIAL STUDENT IDENTITY CARD
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: "6.5px",
            fontWeight: 800,
            color: "#fef08a",
            border: "1px solid rgba(254, 240, 138, 0.45)",
            borderRadius: "3px",
            padding: "1px 4px",
            whiteSpace: "nowrap",
          }}
        >
          {sessionLabel}
        </span>
      </div>

      {/* Body: Portrait + Student Details + Compact QR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "2.6mm",
          padding: "2.4mm 3.2mm",
          flex: 1,
        }}
      >
        {/* Portrait Photo */}
        <div
          style={{
            width: "21mm",
            height: "25.5mm",
            borderRadius: "2.2mm",
            border: "1.5px solid #0A2540",
            background: "#f1f5f9",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {student.AvatarUrl ? (
            <img
              src={student.AvatarUrl}
              alt={fullName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #0A2540 0%, #1e3a8a 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "16px",
              }}
            >
              {initials}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1.1mm" }}>
          <div>
            <div style={{ fontSize: "6px", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
              Student Name
            </div>
            <div
              style={{
                fontSize: "10.5px",
                fontWeight: 800,
                color: "#0A2540",
                lineHeight: 1.15,
                wordBreak: "break-word",
              }}
            >
              {fullName}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "6px", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
              WOFS Student ID
            </div>
            <div
              style={{
                fontSize: "9.5px",
                fontWeight: 900,
                fontFamily: "monospace",
                color: "#14532D",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "3px",
                padding: "1px 4px",
                display: "inline-block",
              }}
            >
              {student.AdmissionNo}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "2mm" }}>
            <div>
              <div style={{ fontSize: "6px", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
                Class / Level
              </div>
              <div style={{ fontSize: "8px", fontWeight: 700, color: "#1e293b" }}>
                {className} &middot; {level}
              </div>
            </div>
            <StatusChip status={status} />
          </div>
        </div>

        {/* Front Mini QR */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1px",
            flexShrink: 0,
          }}
        >
          <div style={{ border: "1px solid #cbd5e1", borderRadius: "3px", padding: "1.5px", background: "#fff" }}>
            <QrCodeSvg value={verifyUrl} size={46} quietZone={1} label={`QR for ${student.AdmissionNo}`} />
          </div>
          <span style={{ fontSize: "5.5px", fontWeight: 700, color: "#475569" }}>SCAN VERIFY</span>
        </div>
      </div>

      {/* Footer Accent Strip */}
      <div
        style={{
          background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          padding: "1.3mm 3.2mm",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "6px",
          color: "#475569",
          fontWeight: 700,
        }}
      >
        <span>PERMANENT SCHOOL IDENTITY</span>
        <span>VALID ACROSS ALL TERMS</span>
      </div>
    </div>
  );
}

function Cr80BackFace({
  student,
  verifyUrl,
}: {
  student: StudentIdCardRecord;
  verifyUrl: string;
}) {
  return (
    <div
      className="cr80-card-face"
      style={{
        width: "85.6mm",
        height: "53.98mm",
        borderRadius: "3.2mm",
        overflow: "hidden",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        boxShadow: "0 6px 18px rgba(10, 37, 64, 0.14)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        color: "#0f172a",
        fontFamily: "var(--font-primary), 'Segoe UI', Arial, sans-serif",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          background: "#0A2540",
          color: "#ffffff",
          padding: "1.6mm 3.2mm",
          fontSize: "6.8px",
          fontWeight: 800,
          letterSpacing: "0.06em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>IDENTITY VERIFICATION &amp; SECURITY</span>
        <span style={{ color: "#86efac" }}>WOFS PORTAL</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "3mm",
          padding: "2.2mm 3.2mm",
          flex: 1,
        }}
      >
        <div
          style={{
            border: "1.5px solid #0A2540",
            borderRadius: "4px",
            padding: "2px",
            background: "#ffffff",
            flexShrink: 0,
          }}
        >
          <QrCodeSvg value={verifyUrl} size={76} quietZone={2} label={`Verification QR for ${student.AdmissionNo}`} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1.5mm" }}>
          <div style={{ fontSize: "7px", fontWeight: 800, color: "#0A2540", lineHeight: 1.25 }}>
            Scan this QR code with any smartphone camera to confirm live enrolment status.
          </div>
          <div style={{ fontSize: "6px", color: "#475569", lineHeight: 1.35 }}>
            This card remains the official property of Word of Faith Group of Schools. If found, please return to the Administrative Office.
          </div>
          <div style={{ fontSize: "6px", color: "#0f172a", fontWeight: 700 }}>
            Office Desk: contact@wofs.sch.ng
          </div>
          <div style={{ fontSize: "5.8px", fontFamily: "monospace", color: "#14532D", fontWeight: 700 }}>
            ID: {student.AdmissionNo}
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: "1px dashed #cbd5e1",
          padding: "1.5mm 3.2mm",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "6px",
          color: "#334155",
        }}
      >
        <span>____________________________<br />Authorized Registrar / Principal</span>
        <span style={{ fontWeight: 800, color: "#14532D" }}>ACADEMIC EXCELLENCE</span>
      </div>
    </div>
  );
}

const emptySubscribe = () => () => {};

export default function StudentIdCardStudio({
  students,
  onClose,
  title = "CR80 Student Identity Card Studio",
  sessionLabel = "2026/2027",
}: {
  students: StudentIdCardRecord[];
  onClose: () => void;
  title?: string;
  sessionLabel?: string;
}) {
  const origin = useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => "https://wofs.vercel.app"
  );
  const [includeBacks, setIncludeBacks] = useState(true);
  const [flipSingle, setFlipSingle] = useState(false);

  const buildVerifyPath = (wofsId: string) =>
    `/verify/student/${wofsId
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/")}`;

  const buildVerifyUrl = (wofsId: string) => `${origin}${buildVerifyPath(wofsId)}`;

  const isSingle = students.length === 1;

  return (
    <div className="portal-modal-overlay cr80-modal-overlay">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .cr80-modal-overlay,
          .cr80-modal-overlay .modal-content {
            position: static !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
          }
          .cr80-print-sheet,
          .cr80-print-sheet * {
            visibility: visible !important;
          }
          .cr80-print-sheet {
            position: static !important;
            width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 6mm !important;
            background: #ffffff !important;
          }
          .cr80-card-face {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-shadow: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="modal-content portal-modal-card"
        style={{ maxWidth: isSingle ? "780px" : "960px", width: "96vw", maxHeight: "92vh", overflowY: "auto" }}
      >
        {/* Toolbar */}
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: "0.9rem",
            marginBottom: "1.1rem",
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: "var(--text-heading)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <FiShield color="var(--brand-primary)" /> {title}
            </h3>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Standard CR80 size (85.6mm &times; 53.98mm) with embedded QR code linked to{" "}
              <code>/verify/student/[wofsId]</code>.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
            {isSingle ? (
              <>
                <button
                  type="button"
                  onClick={() => setFlipSingle((prev) => !prev)}
                  className="btn btn-outline"
                  style={{ fontSize: "0.82rem", padding: "0.45rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <FiRefreshCw size={14} /> {flipSingle ? "Show Both Sides" : "Back Only"}
                </button>
                <Link
                  href={buildVerifyPath(students[0].AdmissionNo)}
                  target="_blank"
                  className="btn btn-outline"
                  style={{ fontSize: "0.82rem", padding: "0.45rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <FiExternalLink size={14} /> Test QR Verify
                </Link>
              </>
            ) : (
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeBacks}
                  onChange={(e) => setIncludeBacks(e.target.checked)}
                />
                Include Back Faces ({students.length} students)
              </label>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-primary"
              style={{ fontSize: "0.85rem", padding: "0.5rem 0.95rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <FiPrinter size={15} /> Print ID Card{students.length > 1 ? "s" : ""}
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                borderRadius: "6px",
                padding: "0.45rem 0.6rem",
                cursor: "pointer",
                color: "var(--text-primary)",
              }}
              aria-label="Close ID card studio"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* Printable Cards Sheet */}
        <div
          className="cr80-print-sheet"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          {students.map((st) => {
            const verifyUrl = buildVerifyUrl(st.AdmissionNo);
            return (
              <div
                key={st.AdmissionNo}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: "6mm",
                  padding: "4mm",
                  borderRadius: "10px",
                  border: "1px dashed var(--border-subtle)",
                  background: "var(--bg-secondary)",
                  pageBreakInside: "avoid",
                }}
              >
                {!(isSingle && flipSingle) && (
                  <Cr80FrontFace
                    student={st}
                    verifyUrl={verifyUrl}
                    sessionLabel={sessionLabel}
                  />
                )}
                {(includeBacks || (isSingle && flipSingle)) && (
                  <Cr80BackFace student={st} verifyUrl={verifyUrl} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
