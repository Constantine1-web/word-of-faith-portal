"use client";

import { useState, useRef } from "react";
import { FiUploadCloud, FiSearch } from "react-icons/fi";
import { uploadManualResult, uploadBulkResults } from "@/app/actions/results";

export default function AdminResultsPage() {
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState("Mathematics");
  const [caScore, setCaScore] = useState("");
  const [examScore, setExamScore] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: "error" | "success", text: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await uploadManualResult({
      admissionNo: studentId,
      subjectName: subject,
      caScore: Number(caScore),
      examScore: Number(examScore)
    });

    if (res.error) {
      setMessage({ type: "error", text: res.error });
    } else {
      setMessage({ type: "success", text: "Result uploaded successfully!" });
      setStudentId("");
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.onerror = () => {
      setMessage({ type: "error", text: "Failed to read file." });
      setLoading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Upload Terminal Results</h1>

      {message && (
        <div style={{ padding: "1rem", marginBottom: "2rem", borderRadius: "var(--radius-sm)", background: message.type === "error" ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)", color: message.type === "error" ? "red" : "green", border: `1px solid ${message.type === "error" ? "red" : "green"}` }}>
          {message.text}
        </div>
      )}

      <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "1fr 2fr" }}>
        
        {/* Bulk Upload Widget */}
        <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <h2 style={{ fontSize: "1.25rem", color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Bulk Upload (CSV)</h2>
          <p style={{ color: "var(--color-gray-600)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Upload a CSV file containing CA and Exam scores for an entire class. Format: AdmissionNo, SubjectName, CAScore, ExamScore.</p>
          
          <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed var(--color-gray-300)", padding: "3rem 1rem", textAlign: "center", borderRadius: "var(--radius-md)", background: "var(--color-gray-50)", cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
            <FiUploadCloud style={{ fontSize: "3rem", color: "var(--color-primary-green)", marginBottom: "1rem" }} />
            <p style={{ color: "var(--color-gray-800)", fontWeight: "bold" }}>Click to browse CSV file</p>
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.85rem" }}>Supports .csv</p>
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleBulkUpload} style={{ display: "none" }} disabled={loading} />
          </div>
        </div>

        {/* Manual Entry Widget */}
        <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <h2 style={{ fontSize: "1.25rem", color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Manual Entry</h2>
          <form onSubmit={handleManualUpload} style={{ display: "grid", gap: "1.5rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Student Admission No.</label>
              <div style={{ position: "relative" }}>
                <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-500)" }} />
                <input 
                  type="text" 
                  value={studentId} 
                  onChange={(e) => setStudentId(e.target.value)} 
                  placeholder="e.g. WOF/2026/001" 
                  style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Subject</label>
              <select 
                value={subject} 
                onChange={(e) => setSubject(e.target.value)}
                style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }}
              >
                <option>Mathematics</option>
                <option>English Language</option>
                <option>Basic Science</option>
                <option>Christian Religious Studies</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>CA Score (30%)</label>
                <input type="number" max="30" value={caScore} onChange={(e) => setCaScore(e.target.value)} required style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-800)" }}>Exam Score (70%)</label>
                <input type="number" max="70" value={examScore} onChange={(e) => setExamScore(e.target.value)} required style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-300)" }} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: "1rem", display: "flex", justifyContent: "center", opacity: loading ? 0.7 : 1 }}>{loading ? "Saving..." : "Save Result"}</button>
          </form>
        </div>

      </div>
    </div>
  );
}
