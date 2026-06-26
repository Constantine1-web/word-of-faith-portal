"use client";

import { useState } from "react";
import { FiUploadCloud, FiSearch } from "react-icons/fi";

export default function AdminResultsPage() {
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState("Mathematics");
  const [caScore, setCaScore] = useState("");
  const [examScore, setExamScore] = useState("");

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Results uploaded successfully to the database! (Mock)");
    setStudentId("");
    setCaScore("");
    setExamScore("");
  };

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Upload Terminal Results</h1>

      <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "1fr 2fr" }}>
        
        {/* Bulk Upload Widget */}
        <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <h2 style={{ fontSize: "1.25rem", color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Bulk Upload (CSV)</h2>
          <p style={{ color: "var(--color-gray-600)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Upload a CSV file containing CA and Exam scores for an entire class.</p>
          
          <div style={{ border: "2px dashed var(--color-gray-300)", padding: "3rem 1rem", textAlign: "center", borderRadius: "var(--radius-md)", background: "var(--color-gray-50)", cursor: "pointer" }}>
            <FiUploadCloud style={{ fontSize: "3rem", color: "var(--color-primary-green)", marginBottom: "1rem" }} />
            <p style={{ color: "var(--color-gray-800)", fontWeight: "bold" }}>Click to browse or drag file here</p>
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.85rem" }}>Supports .csv, .xlsx</p>
          </div>
        </div>

        {/* Manual Entry Widget */}
        <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
          <h2 style={{ fontSize: "1.25rem", color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Manual Entry</h2>
          <form onSubmit={handleUpload} style={{ display: "grid", gap: "1.5rem" }}>
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

            <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>Save Result</button>
          </form>
        </div>

      </div>
    </div>
  );
}
