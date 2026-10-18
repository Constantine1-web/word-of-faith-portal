"use client";

import { useState } from "react";
import Link from "next/link";
import { FiPrinter, FiCheckCircle, FiUploadCloud, FiSearch, FiLayers, FiFileText } from "react-icons/fi";
import { uploadManualResult, uploadBulkResults } from "@/app/actions/results";

export default function AdminResultsClient({
  classes,
  subjects,
  activeTerm
}: {
  classes: any[];
  subjects: any[];
  activeTerm: any;
}) {
  const [activeTab, setActiveTab] = useState<"broadsheets" | "upload">("broadsheets");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Manual Upload Form
  const [studentAdmissionNo, setStudentAdmissionNo] = useState("");
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]?.SubjectName || "Mathematics");
  const [caScore, setCaScore] = useState("");
  const [examScore, setExamScore] = useState("");

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await uploadManualResult({
      admissionNo: studentAdmissionNo.trim(),
      subjectName: selectedSubject,
      caScore: Number(caScore),
      examScore: Number(examScore)
    });

    if (res.error) {
      setMessage({ type: "error", text: res.error });
    } else {
      setMessage({ type: "success", text: "Result uploaded successfully!" });
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
        <div style={{ padding: "1rem", marginBottom: "1.5rem", borderRadius: "var(--radius-md)", background: message.type === "error" ? "#fee2e2" : "#dcfce7", color: message.type === "error" ? "#b91c1c" : "#15803d", fontWeight: "bold" }}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "1rem", borderBottom: "2px solid var(--color-gray-200)", marginBottom: "2rem" }}>
        <button
          onClick={() => setActiveTab("broadsheets")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1.05rem",
            fontWeight: "bold",
            color: activeTab === "broadsheets" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "broadsheets" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <FiLayers /> Class Broadsheets & Status ({classes.length} Arms)
        </button>

        <button
          onClick={() => setActiveTab("upload")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1.05rem",
            fontWeight: "bold",
            color: activeTab === "upload" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "upload" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <FiUploadCloud /> Bulk CSV / Manual Score Override
        </button>
      </div>

      {/* TAB 1: BROADSHEETS & STATUS */}
      {activeTab === "broadsheets" && (
        <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
          <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "1rem", textAlign: "left" }}>Class Arm</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Designated Form Master</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Enrolled Students</th>
                <th style={{ padding: "1rem", textAlign: "center" }}>Subject Submissions</th>
                <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                    No class arms found.
                  </td>
                </tr>
              ) : (
                classes.map((cls) => {
                  const totalSubj = cls._count?.TeacherMaps || 0;
                  const submitted = cls.SubjectSubmissions?.length || 0;
                  const isAllSubmitted = totalSubj > 0 && submitted >= totalSubj;

                  return (
                    <tr key={cls.ClassID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                      <td data-label="Class Arm" style={{ padding: "1rem", fontWeight: "bold", color: "var(--color-navy-blue)" }}>
                        {cls.ClassName} ({cls.Level})
                      </td>
                      <td data-label="Form Master" style={{ padding: "1rem", color: "var(--color-gray-700)" }}>
                        {cls.FormMaster?.Email || <span style={{ color: "var(--color-gray-400)", fontStyle: "italic" }}>Not Assigned</span>}
                      </td>
                      <td data-label="Students" style={{ padding: "1rem", textAlign: "center", fontWeight: "600" }}>
                        {cls._count?.Students || 0} students
                      </td>
                      <td data-label="Submissions" style={{ padding: "1rem", textAlign: "center" }}>
                        <span style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          background: isAllSubmitted ? "#dcfce7" : "#fef3c7",
                          color: isAllSubmitted ? "#15803d" : "#b45309"
                        }}>
                          {submitted} / {totalSubj} Subjects
                        </span>
                      </td>
                      <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                        <Link
                          href={`/portal/broadsheet/${cls.ClassID}`}
                          target="_blank"
                          className="btn btn-outline"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          <FiPrinter /> View Broadsheet
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: MANUAL / BULK UPLOAD OVERRIDE */}
      {activeTab === "upload" && (
        <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "1fr 1fr" }}>
          {/* Bulk Upload Widget */}
          <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", boxShadow: "var(--shadow-sm)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>Bulk CSV Score Import</h3>
            <p style={{ color: "var(--color-gray-600)", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
              Upload a spreadsheet with scores. Format: <code>AdmissionNo, SubjectName, CAScore, ExamScore</code>
            </p>

            <label style={{
              display: "block",
              border: "2px dashed var(--color-gray-300)",
              padding: "3rem 1rem",
              textAlign: "center",
              borderRadius: "var(--radius-md)",
              background: "var(--color-gray-50)",
              cursor: "pointer"
            }}>
              <FiUploadCloud size={40} style={{ color: "var(--color-primary-green)", marginBottom: "0.5rem" }} />
              <div style={{ fontWeight: "bold", color: "var(--color-navy-blue)" }}>Click to browse CSV</div>
              <input type="file" accept=".csv" onChange={handleBulkUpload} style={{ display: "none" }} disabled={loading} />
            </label>
          </div>

          {/* Manual Entry Form */}
          <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", boxShadow: "var(--shadow-sm)" }}>
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
                  {subjects.map(s => (
                    <option key={s.SubjectID} value={s.SubjectName}>{s.SubjectName}</option>
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

              <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "1rem" }} disabled={loading}>
                {loading ? "Saving..." : "Save Single Score"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
