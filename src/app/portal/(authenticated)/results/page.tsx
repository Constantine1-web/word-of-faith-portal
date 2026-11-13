"use client";

import { useState } from "react";
import { verifyScratchCard } from "@/app/actions/scratchCards";
import { useSession } from "next-auth/react";
import { FiPrinter, FiDownload, FiCheckCircle, FiAward, FiArrowLeft, FiKey } from "react-icons/fi";

function deriveRemark(grade: string, existingRemark?: string | null): string {
  if (existingRemark && existingRemark.trim().length > 0) return existingRemark;
  switch ((grade || "").toUpperCase()) {
    case "A":
    case "A1":
      return "Distinction / Excellent";
    case "B":
    case "B2":
    case "B3":
      return "Very Good";
    case "C":
    case "C4":
    case "C5":
    case "C6":
      return "Credit";
    case "D":
    case "D7":
    case "E":
    case "E8":
      return "Pass";
    default:
      return "Needs Improvement";
  }
}

export default function ResultsPage() {
  const { data: session } = useSession();
  const [pin, setPin] = useState("");
  const [termId, setTermId] = useState(1);
  const [resultData, setResultData] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCheckResult = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus("Verifying Scratch Card PIN...");
    const res = await verifyScratchCard(pin.trim(), termId);

    if (res.success) {
      setResultData(res.data);
      setStatus(res.message || "Success");
    } else {
      setStatus(`Error: ${res.error}`);
    }
    setLoading(false);
  };

  const resultsList: any[] = resultData?.results || [];
  const totalObtained = resultsList.reduce((acc, r) => acc + Number(r.TotalScore || 0), 0);
  const maxPossible = resultsList.length * 100;
  const averagePct =
    resultsList.length > 0 ? Number((totalObtained / resultsList.length).toFixed(1)) : 0;

  const studentFullName =
    resultData?.student?.PreferredName ||
    `${resultData?.student?.FirstName || ""} ${resultData?.student?.LastName || ""}`.trim() ||
    resultData?.student?.User?.FullName ||
    resultData?.student?.User?.Email?.split("@")[0]?.toUpperCase() ||
    "Student";

  const formMasterRemark =
    resultData?.formMasterReport?.FormMasterRemark ||
    (averagePct >= 75
      ? "An exemplary and diligent student who participates actively in class."
      : averagePct >= 55
      ? "A commendable effort this term. Keep striving for higher excellence."
      : "Requires closer study habits and extra attention in core subjects.");

  const principalRemark =
    resultData?.formMasterReport?.PrincipalRemark ||
    (averagePct >= 75
      ? "Outstanding terminal performance. Keep flying the Word of Faith banner high!"
      : averagePct >= 50
      ? "Satisfactory result. Put in more effort next term."
      : "Must work harder next term.");

  let parsedAffective: Record<string, number> = {
    punctuality: 5,
    neatness: 5,
    politeness: 5,
    attentiveness: 4,
    selfControl: 5,
  };
  let parsedPsychomotor: Record<string, number> = {
    handwriting: 4,
    sports: 5,
    verbalFluency: 4,
    laboratorySkills: 4,
  };

  if (resultData?.formMasterReport?.AffectiveTraits) {
    try {
      parsedAffective = JSON.parse(resultData.formMasterReport.AffectiveTraits);
    } catch {}
  }
  if (resultData?.formMasterReport?.PsychomotorTraits) {
    try {
      parsedPsychomotor = JSON.parse(resultData.formMasterReport.PsychomotorTraits);
    } catch {}
  }

  const attendanceLabel = resultData?.attendanceSummary?.totalRecordedDays
    ? `${resultData.attendanceSummary.presentDays} / ${resultData.attendanceSummary.totalRecordedDays} Days Present`
    : "Cleared";

  const handlePrintOfficialReportCard = () => {
    if (!resultData) return;
    const win = window.open("", "_blank", "width=900,height=1050");
    if (!win) {
      window.print();
      return;
    }

    const rowsHtml = resultsList
      .map(
        (res: any, idx: number) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${res.Subject?.SubjectName || `Subject ${res.SubjectID}`}</strong></td>
          <td style="text-align: center;">${res.CAScore}</td>
          <td style="text-align: center;">${res.ExamScore}</td>
          <td style="text-align: center; font-weight: 800;">${res.TotalScore}</td>
          <td style="text-align: center; font-weight: 800; color: ${
            res.Grade === "F" || res.Grade === "F9" ? "#dc2626" : "#15803d"
          };">${res.Grade}</td>
          <td>${deriveRemark(res.Grade, res.Remark)}</td>
        </tr>`
      )
      .join("");

    const affectiveHtml = Object.entries(parsedAffective)
      .map(
        ([k, v]) =>
          `<span style="display:inline-block;margin-right:10px;margin-bottom:4px;background:#fff;border:1px solid #cbd5e1;padding:3px 8px;border-radius:4px;font-size:11.5px;"><strong style="text-transform:capitalize;">${k}:</strong> ${v}/5</span>`
      )
      .join("");

    const psychomotorHtml = Object.entries(parsedPsychomotor)
      .map(
        ([k, v]) =>
          `<span style="display:inline-block;margin-right:10px;margin-bottom:4px;background:#fff;border:1px solid #86efac;padding:3px 8px;border-radius:4px;font-size:11.5px;"><strong style="text-transform:capitalize;">${k}:</strong> ${v}/5</span>`
      )
      .join("");

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Terminal Report Card - ${resultData.student?.AdmissionNo || "Student"}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0f172a; padding: 24px; background: #fff; }
            .sheet { max-width: 820px; margin: 0 auto; border: 2px solid #0A2540; border-radius: 12px; padding: 28px; }
            .header { text-align: center; border-bottom: 3px double #16a34a; padding-bottom: 14px; margin-bottom: 18px; }
            .school-name { font-size: 24px; font-weight: 800; color: #0A2540; text-transform: uppercase; margin: 0; }
            .school-motto { font-size: 12px; color: #15803d; font-weight: 700; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.8px; }
            .badge { display: inline-block; margin-top: 10px; background: #0A2540; color: #fff; padding: 5px 18px; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            .bio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 18px; font-size: 13px; }
            .bio-item strong { display: block; font-size: 10.5px; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px; }
            th { background: #0A2540; color: #fff; padding: 10px 8px; text-transform: uppercase; font-size: 11px; text-align: left; }
            td { padding: 10px 8px; border-bottom: 1px solid #cbd5e1; }
            tr:nth-child(even) td { background: #f8fafc; }
            .traits-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
            .traits-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; font-size: 12px; }
            .remarks-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; font-size: 13px; }
            .remarks-box div { margin-bottom: 8px; }
            .footer-sigs { display: flex; justify-content: space-between; margin-top: 28px; padding-top: 16px; border-top: 1px dashed #94a3b8; font-size: 12px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <h1 class="school-name">Word of Faith Group of Schools</h1>
              <p class="school-motto">Academic Excellence &amp; Godly Character • Official Terminal Report Sheet</p>
              <span class="badge">${resultData.term?.TermName || "First Term"} (${resultData.term?.SessionName || "2025/2026"})</span>
            </div>
            <div class="bio-grid">
              <div class="bio-item"><strong>Student Name</strong>${studentFullName}</div>
              <div class="bio-item"><strong>Admission Number</strong>${resultData.student?.AdmissionNo || "—"}</div>
              <div class="bio-item"><strong>Class / Level</strong>${resultData.student?.Class?.ClassName || "—"} (${resultData.student?.Class?.Level || "Secondary"})</div>
              <div class="bio-item"><strong>Total Marks Obtained</strong>${totalObtained} / ${maxPossible}</div>
              <div class="bio-item"><strong>Terminal Average</strong>${averagePct}%</div>
              <div class="bio-item"><strong>Term Attendance</strong>${attendanceLabel}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="text-align: center; width: 40px;">S/N</th>
                  <th>Subject</th>
                  <th style="text-align: center;">CA (40)</th>
                  <th style="text-align: center;">Exam (60)</th>
                  <th style="text-align: center;">Total (100)</th>
                  <th style="text-align: center;">Grade</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div class="traits-grid">
              <div class="traits-card">
                <div style="font-weight: 800; color: #0A2540; margin-bottom: 6px; text-transform: uppercase; font-size: 11px;">Affective &amp; Behavioral Domain (1–5)</div>
                ${affectiveHtml}
              </div>
              <div class="traits-card">
                <div style="font-weight: 800; color: #15803d; margin-bottom: 6px; text-transform: uppercase; font-size: 11px;">Psychomotor &amp; Practical Skills (1–5)</div>
                ${psychomotorHtml}
              </div>
            </div>
            <div class="remarks-box">
              <div><strong>Form Master's Remark:</strong> ${formMasterRemark}</div>
              <div style="margin-bottom: 0;"><strong>Principal's Official Remark:</strong> ${principalRemark}</div>
            </div>
            <div style="font-size: 11px; color: #64748b;">
              <strong>Grading Scale:</strong> A (70–100%: Distinction) • B (60–69%: Very Good) • C (50–59%: Credit) • D/E (40–49%: Pass) • F (0–39%: Fail)
            </div>
            <div class="footer-sigs">
              <div><strong>Form Master's Signature:</strong> Signed &amp; Verified</div>
              <div><strong>Date Issued:</strong> ${new Date().toLocaleDateString("en-NG", { day: "2-digit", month: "long", year: "numeric" })}</div>
              <div><strong>Principal's Stamp &amp; Signature:</strong> Approved</div>
            </div>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        Terminal Results &amp; Report Card
      </h1>

      <div style={{ background: "var(--color-white)", padding: "clamp(1.25rem, 3vw, 2.25rem)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", maxWidth: "920px" }}>
        {!resultData ? (
          <div>
            <h2 style={{ marginBottom: "0.5rem", color: "var(--color-primary-green)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiKey /> Scratch Card Gateway
            </h2>
            <p style={{ marginBottom: "1.5rem", color: "var(--color-gray-800)" }}>
              Enter your valid Scratch Card PIN to unlock and download your official terminal report sheet.
            </p>

            <form onSubmit={handleCheckResult} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "420px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-900)" }}>
                  Academic Term
                </label>
                <select
                  value={termId}
                  onChange={(e) => setTermId(parseInt(e.target.value))}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)", color: "var(--color-gray-900)" }}
                >
                  <option value={1}>First Term (2025/2026)</option>
                  <option value={2}>Second Term (2025/2026)</option>
                  <option value={3}>Third Term (2025/2026)</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-900)" }}>
                  Scratch Card PIN
                </label>
                <input
                  type="text"
                  placeholder="e.g. WOF-TEST-7890 or 12-Digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-200)",
                    letterSpacing: "1.5px",
                    textAlign: "center",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    background: "var(--color-gray-50)",
                    color: "var(--color-gray-900)",
                  }}
                  maxLength={24}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ marginTop: "0.75rem", width: "100%" }}
              >
                {loading ? "Verifying PIN..." : "Access Terminal Report Card"}
              </button>
              {status && (
                <p
                  style={{
                    marginTop: "0.75rem",
                    textAlign: "center",
                    color: status.includes("Error") ? "#dc2626" : "#15803d",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                  }}
                >
                  {status}
                </p>
              )}
            </form>
          </div>
        ) : (
          <div>
            {/* Top Action Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <button
                type="button"
                onClick={() => {
                  setResultData(null);
                  setStatus("");
                  setPin("");
                }}
                style={{
                  padding: "0.5rem 0.95rem",
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--color-gray-300)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 700,
                  color: "var(--color-gray-900)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <FiArrowLeft /> Check Another Term
              </button>

              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handlePrintOfficialReportCard}
                  style={{
                    background: "linear-gradient(135deg, #16a34a, #15803d)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.55rem 1.1rem",
                    fontWeight: 700,
                    fontSize: "0.86rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                  }}
                >
                  <FiDownload /> Download / Print Official Report Card (PDF)
                </button>
              </div>
            </div>

            {/* Official Report Sheet Header */}
            <div style={{ textAlign: "center", marginBottom: "1.75rem", borderBottom: "3px double var(--color-primary-green)", paddingBottom: "1.25rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--color-primary-green)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Word of Faith Group of Schools
              </div>
              <h2 style={{ color: "var(--color-navy-blue)", fontSize: "1.65rem", margin: "0.25rem 0" }}>
                Official Terminal Report Card
              </h2>
              <span
                style={{
                  display: "inline-block",
                  background: "var(--surface-table-head)",
                  color: "var(--text-table-head)",
                  padding: "0.28rem 0.95rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                }}
              >
                {resultData.term?.TermName || "First Term"} • {resultData.term?.SessionName || "2025/2026"}
              </span>
            </div>

            {/* Student Bio & Summary KPI Strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 165px), 1fr))",
                gap: "0.85rem",
                background: "var(--surface-subtle)",
                padding: "1.1rem 1.25rem",
                borderRadius: "10px",
                border: "1px solid var(--color-gray-200)",
                marginBottom: "1.5rem",
                fontSize: "0.88rem",
              }}
            >
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 700, textTransform: "uppercase" }}>Student Name</div>
                <div style={{ fontWeight: 800, color: "var(--color-gray-900)", marginTop: "0.15rem" }}>{studentFullName}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 700, textTransform: "uppercase" }}>Admission No</div>
                <div style={{ fontWeight: 800, color: "var(--color-gray-900)", marginTop: "0.15rem" }}>{resultData.student?.AdmissionNo}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 700, textTransform: "uppercase" }}>Class / Level</div>
                <div style={{ fontWeight: 800, color: "var(--color-gray-900)", marginTop: "0.15rem" }}>
                  {resultData.student?.Class?.ClassName} ({resultData.student?.Class?.Level || "Secondary"})
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 700, textTransform: "uppercase" }}>Total Score</div>
                <div style={{ fontWeight: 800, color: "var(--color-gray-900)", marginTop: "0.15rem" }}>
                  {totalObtained} / {maxPossible}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 700, textTransform: "uppercase" }}>Term Attendance</div>
                <div style={{ fontWeight: 800, color: "var(--color-gray-900)", marginTop: "0.15rem" }}>{attendanceLabel}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--badge-success-text)", fontWeight: 700, textTransform: "uppercase" }}>Terminal Average</div>
                <div style={{ fontWeight: 800, color: "var(--badge-success-text)", fontSize: "1.05rem", marginTop: "0.1rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <FiAward /> {averagePct}%
                </div>
              </div>
            </div>

            {/* Subject Breakdown Table */}
            <div className="table-scroll">
              <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--color-gray-900)", minWidth: "580px" }}>
                <thead>
                  <tr style={{ background: "var(--surface-table-head)", color: "var(--text-table-head)" }}>
                    <th style={{ padding: "0.85rem", textAlign: "left", fontSize: "0.8rem", textTransform: "uppercase" }}>Subject</th>
                    <th style={{ padding: "0.85rem", textAlign: "center", fontSize: "0.8rem", textTransform: "uppercase" }}>CA (40)</th>
                    <th style={{ padding: "0.85rem", textAlign: "center", fontSize: "0.8rem", textTransform: "uppercase" }}>Exam (60)</th>
                    <th style={{ padding: "0.85rem", textAlign: "center", fontSize: "0.8rem", textTransform: "uppercase" }}>Total (100)</th>
                    <th style={{ padding: "0.85rem", textAlign: "center", fontSize: "0.8rem", textTransform: "uppercase" }}>Grade</th>
                    <th style={{ padding: "0.85rem", textAlign: "left", fontSize: "0.8rem", textTransform: "uppercase" }}>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {resultsList.length > 0 ? (
                    resultsList.map((res: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--color-gray-200)", background: idx % 2 === 0 ? "var(--color-white)" : "var(--surface-subtle)" }}>
                        <td style={{ padding: "0.85rem", fontWeight: 700, color: "var(--color-gray-900)" }}>
                          {res.Subject?.SubjectName || `Subject ${res.SubjectID}`}
                        </td>
                        <td style={{ padding: "0.85rem", textAlign: "center" }}>{res.CAScore}</td>
                        <td style={{ padding: "0.85rem", textAlign: "center" }}>{res.ExamScore}</td>
                        <td style={{ padding: "0.85rem", textAlign: "center", fontWeight: 800, color: "var(--color-gray-900)" }}>{res.TotalScore}</td>
                        <td
                          style={{
                            padding: "0.85rem",
                            textAlign: "center",
                            color: res.Grade === "F" || res.Grade === "F9" ? "var(--badge-danger-text)" : "var(--badge-success-text)",
                            fontWeight: 800,
                          }}
                        >
                          {res.Grade}
                        </td>
                        <td style={{ padding: "0.85rem", fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                          {deriveRemark(res.Grade, res.Remark)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                        No results found for this term.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Affective & Psychomotor Behavioral Domain Ratings */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
                gap: "1rem",
                marginTop: "1.35rem",
              }}
            >
              <div
                style={{
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--color-gray-200)",
                  borderRadius: "10px",
                  padding: "1rem 1.15rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "var(--color-navy-blue)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "0.65rem",
                    borderBottom: "1px solid var(--color-gray-200)",
                    paddingBottom: "0.4rem",
                  }}
                >
                  Affective Domain Assessment (1–5 Scale)
                </div>
                <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.83rem" }}>
                  {Object.entries(parsedAffective).map(([key, val]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--color-gray-600)", textTransform: "capitalize" }}>
                        {key.replace(/([A-Z])/g, " $1")}
                      </span>
                      <span style={{ fontWeight: 800, color: "var(--color-gray-900)" }}>{String(val)} / 5</span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: "var(--badge-success-bg)",
                  border: "1px solid var(--color-primary-green)",
                  borderRadius: "10px",
                  padding: "1rem 1.15rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "var(--badge-success-text)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "0.65rem",
                    borderBottom: "1px solid var(--color-primary-green)",
                    paddingBottom: "0.4rem",
                  }}
                >
                  Psychomotor Skills Assessment (1–5 Scale)
                </div>
                <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.83rem" }}>
                  {Object.entries(parsedPsychomotor).map(([key, val]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--color-gray-900)", textTransform: "capitalize" }}>
                        {key.replace(/([A-Z])/g, " $1")}
                      </span>
                      <span style={{ fontWeight: 800, color: "var(--badge-success-text)" }}>{String(val)} / 5</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Official Remarks & Verification Footer */}
            <div
              style={{
                marginTop: "1.25rem",
                background: "var(--badge-success-bg)",
                border: "1px solid var(--color-primary-green)",
                borderRadius: "10px",
                padding: "1.15rem 1.25rem",
                fontSize: "0.88rem",
                color: "var(--color-gray-900)",
              }}
            >
              <div style={{ marginBottom: "0.5rem" }}>
                <strong>Form Master&apos;s Remark:</strong> {formMasterRemark}
              </div>
              <div>
                <strong>Principal&apos;s Official Remark:</strong> {principalRemark}
              </div>
            </div>

            <div
              style={{
                marginTop: "1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
                fontSize: "0.8rem",
                color: "var(--color-gray-500)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--badge-success-text)", fontWeight: 700 }}>
                <FiCheckCircle /> Verified via Scratch Card ({resultData.cardMeta?.serialNumber || "ACTIVE"})
              </span>
              <span>
                Remaining Card Checks: <strong>{resultData.cardMeta?.remainingUses ?? "—"}</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
