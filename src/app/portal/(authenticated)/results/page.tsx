"use client";

import { useState } from "react";
import { verifyScratchCard } from "@/app/actions/scratchCards";
import { useSession } from "next-auth/react";

export default function ResultsPage() {
  const { data: session } = useSession();
  const [pin, setPin] = useState("");
  const [termId, setTermId] = useState(1);
  const [resultData, setResultData] = useState<any>(null);
  const [status, setStatus] = useState("");

  const handleCheckResult = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Verifying PIN...");
    const res = await verifyScratchCard(pin, termId);
    
    if (res.success) {
      setResultData(res.data);
      setStatus(res.message || "Success");
    } else {
      setStatus(`Error: ${res.error}`);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Results Management</h1>

      <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", maxWidth: "800px" }}>
        
        {!resultData ? (
          <div>
            <h2 style={{ marginBottom: "1rem", color: "var(--color-primary-green)" }}>Scratch Card Gateway</h2>
            <p style={{ marginBottom: "1.5rem", color: "var(--color-gray-800)" }}>Please enter a valid 12-digit Scratch Card PIN to access your terminal report card.</p>
            
            <form onSubmit={handleCheckResult} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "400px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-900)" }}>Academic Term</label>
                <select 
                  value={termId} onChange={(e) => setTermId(parseInt(e.target.value))} 
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)", color: "var(--color-gray-900)" }}
                >
                  <option value={1}>First Term (2025/2026)</option>
                  <option value={2}>Second Term (2025/2026)</option>
                  <option value={3}>Third Term (2025/2026)</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-gray-900)" }}>12-Digit PIN</label>
                <input 
                  type="text" 
                  placeholder="Enter Scratch Card PIN" 
                  value={pin} 
                  onChange={(e) => setPin(e.target.value)} 
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-200)", letterSpacing: "2px", textAlign: "center", fontSize: "1.1rem", background: "var(--color-gray-50)", color: "var(--color-gray-900)" }}
                  maxLength={12}
                  required 
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem", width: "100%" }}>
                Access Results
              </button>
              {status && <p style={{ marginTop: "1rem", textAlign: "center", color: status.includes("Error") ? "red" : "green", fontWeight: 500 }}>{status}</p>}
            </form>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", position: "relative" }}>
              <button 
                onClick={() => { setResultData(null); setStatus(""); setPin(""); }}
                style={{ position: "absolute", top: 0, left: 0, padding: "0.5rem 1rem", background: "var(--color-gray-100)", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
              >
                ← Back
              </button>
              <h3 style={{ color: "var(--color-primary-green)", fontSize: "1.8rem" }}>Word of Faith Schools</h3>
              <p style={{ color: "var(--color-gray-800)", fontWeight: "bold" }}>Terminal Report Card</p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem", color: "var(--color-gray-900)" }}>
              <div>
                <p><strong>Student:</strong> {resultData.student?.User?.Email?.split('@')[0].toUpperCase()}</p>
                <p><strong>Admission No:</strong> {resultData.student?.AdmissionNo}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p><strong>Class:</strong> {resultData.student?.Class?.ClassName}</p>
                <p><strong>Term:</strong> {resultData.term?.TermName}</p>
              </div>
            </div>
            
            <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--color-gray-900)" }}>
              <thead>
                <tr style={{ background: "var(--color-gray-100)", borderBottom: "2px solid var(--color-gray-200)" }}>
                  <th style={{ padding: "0.75rem", textAlign: "left" }}>Subject</th>
                  <th style={{ padding: "0.75rem", textAlign: "center" }}>CA</th>
                  <th style={{ padding: "0.75rem", textAlign: "center" }}>Exam</th>
                  <th style={{ padding: "0.75rem", textAlign: "center" }}>Total</th>
                  <th style={{ padding: "0.75rem", textAlign: "center" }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {resultData.results.length > 0 ? resultData.results.map((res: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                    <td style={{ padding: "0.75rem" }}>{res.Subject?.SubjectName || `Subject ${res.SubjectID}`}</td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>{res.CAScore}</td>
                    <td style={{ padding: "0.75rem", textAlign: "center" }}>{res.ExamScore}</td>
                    <td style={{ padding: "0.75rem", textAlign: "center", fontWeight: "bold" }}>{res.TotalScore}</td>
                    <td style={{ padding: "0.75rem", textAlign: "center", color: res.Grade === 'F' ? 'red' : 'var(--color-primary-green)', fontWeight: "bold" }}>{res.Grade}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} style={{ padding: "1rem", textAlign: "center" }}>No results found for this term.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={() => window.print()}>Print / Download PDF</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
