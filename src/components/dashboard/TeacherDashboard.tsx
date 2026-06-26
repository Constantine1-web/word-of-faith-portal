"use client";

import { useState, useEffect, useTransition, useOptimistic } from "react";
import { saveResult, getStudentsInClass } from "@/app/actions/results";
import { debounce } from "@/lib/debounce";
import TeacherAttendance from "./TeacherAttendance";
import Link from "next/link";

export default function TeacherDashboard({ teacherId, initialAssignments = [] }: { teacherId: string, initialAssignments?: any[] }) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [students, setStudents] = useState<any[]>([]);
  const [loading, startTransition] = useTransition();
  const [scores, setScores] = useState<Record<number, { ca: number; exam: number }>>({});
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"results" | "attendance">("results");

  const selectedAssignment = initialAssignments.find(a => a.id.toString() === selectedAssignmentId);

  // Next.js 14 Optimistic UI hook for status
  const [optimisticStatus, addOptimisticStatus] = useOptimistic(
    saveStatus,
    (state, newStatus: string) => newStatus
  );

  useEffect(() => {
    if (selectedAssignment) {
      startTransition(async () => {
        const fetchedStudents = await getStudentsInClass(selectedAssignment.ClassID);
        setStudents(fetchedStudents);
        
        const initialScores: any = {};
        fetchedStudents.forEach(student => {
          initialScores[student.StudentID] = { ca: 0, exam: 0 };
        });
        setScores(initialScores);
        setSaveStatus("");
      });
    } else {
      setStudents([]);
    }
  }, [selectedAssignmentId]);

  const handleScoreChange = (studentId: number, field: 'ca' | 'exam', value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setScores(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: numValue
      }
    }));
  };

  // Debounced API Request to prevent spamming the backend
  const executeSaveAll = debounce(async () => {
    if (!selectedAssignment) return;
    
    try {
      for (const student of students) {
        const score = scores[student.StudentID];
        if (score) {
          await saveResult({
            studentId: student.StudentID,
            subjectId: selectedAssignment.SubjectID,
            termId: 1, // Demo TermID
            caScore: score.ca,
            examScore: score.exam
          });
        }
      }
      setSaveStatus("All results saved successfully!");
    } catch (e: any) {
      setSaveStatus(`Error saving results: ${e.message}`);
    }
  }, 500);

  const handleSaveAllClick = () => {
    if (students.length === 0) return;
    // Instantly update the UI before the API requests are made
    addOptimisticStatus("Saving all results optimistically...");
    executeSaveAll();
  };

  return (
    <div>
      <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
        Teacher Controls
      </h3>
      <p style={{ marginBottom: "1.5rem" }}>Welcome to the Teacher Portal. Select an assigned class and subject to input Continuous Assessment (CA) and Exam scores.</p>

      <div style={{ marginBottom: "2rem", background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", color: "var(--color-navy-blue)" }}>Select Assignment</label>
        <select 
          className="btn-outline"
          style={{ width: "100%", maxWidth: "400px", padding: "0.75rem", borderRadius: "var(--radius-sm)", borderColor: "var(--color-gray-300)" }}
          value={selectedAssignmentId}
          onChange={(e) => setSelectedAssignmentId(e.target.value)}
        >
          <option value="">-- Choose Class & Subject --</option>
          {initialAssignments.map((assignment: any) => (
            <option key={assignment.id} value={assignment.id.toString()}>
              {assignment.Class.ClassName} - {assignment.Subject.SubjectName}
            </option>
          ))}
        </select>
      </div>

      {loading && <p style={{ color: "var(--color-gray-600)", fontStyle: "italic" }}>Loading students...</p>}

      {!loading && selectedAssignment && students.length > 0 && (
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", overflowX: "auto" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button 
                onClick={() => setActiveTab("results")}
                style={{ background: "none", border: "none", paddingBottom: "0.5rem", borderBottom: activeTab === "results" ? "2px solid var(--color-primary-green)" : "2px solid transparent", color: activeTab === "results" ? "var(--color-navy-blue)" : "var(--color-gray-500)", fontWeight: activeTab === "results" ? "bold" : "normal", cursor: "pointer", fontSize: "1.1rem" }}
              >
                Academic Results
              </button>
              <button 
                onClick={() => setActiveTab("attendance")}
                style={{ background: "none", border: "none", paddingBottom: "0.5rem", borderBottom: activeTab === "attendance" ? "2px solid var(--color-primary-green)" : "2px solid transparent", color: activeTab === "attendance" ? "var(--color-navy-blue)" : "var(--color-gray-500)", fontWeight: activeTab === "attendance" ? "bold" : "normal", cursor: "pointer", fontSize: "1.1rem" }}
              >
                Daily Attendance
              </button>
            </div>
            <Link 
              href={`/portal/broadsheet/${selectedAssignment.ClassID}`} 
              target="_blank"
              className="btn btn-outline"
            >
              Print Broad-Sheet
            </Link>
          </div>

          {activeTab === "results" ? (
            <>
              <table className="responsive-table" style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                    <th style={{ padding: "1rem 0.75rem", textAlign: "left", color: "var(--color-gray-800)" }}>Admission No</th>
                    <th style={{ padding: "1rem 0.75rem", textAlign: "left", color: "var(--color-gray-800)" }}>Name</th>
                    <th style={{ padding: "1rem 0.75rem", textAlign: "center", width: "120px", color: "var(--color-gray-800)" }}>CA (Max 40)</th>
                    <th style={{ padding: "1rem 0.75rem", textAlign: "center", width: "120px", color: "var(--color-gray-800)" }}>Exam (Max 60)</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.StudentID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                      <td data-label="Admission No" style={{ padding: "1rem 0.75rem", color: "var(--color-gray-600)" }}>{student.AdmissionNo}</td>
                      <td data-label="Name" style={{ padding: "1rem 0.75rem", fontWeight: "600", color: "var(--color-navy-blue)" }}>{student.PreferredName || student.User?.Email}</td>
                      <td data-label="CA Score" style={{ padding: "1rem 0.75rem", textAlign: "center" }}>
                        <input 
                          type="number"
                          max="40"
                          min="0"
                          className="btn-outline"
                          style={{ width: "80px", padding: "0.5rem", borderRadius: "var(--radius-sm)", borderColor: "var(--color-gray-300)", textAlign: "center" }}
                          value={scores[student.StudentID]?.ca || ""}
                          onChange={(e) => handleScoreChange(student.StudentID, 'ca', e.target.value)}
                        />
                      </td>
                      <td data-label="Exam Score" style={{ padding: "1rem 0.75rem", textAlign: "center" }}>
                        <input 
                          type="number"
                          max="60"
                          min="0"
                          className="btn-outline"
                          style={{ width: "80px", padding: "0.5rem", borderRadius: "var(--radius-sm)", borderColor: "var(--color-gray-300)", textAlign: "center" }}
                          value={scores[student.StudentID]?.exam || ""}
                          onChange={(e) => handleScoreChange(student.StudentID, 'exam', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <button 
              onClick={handleSaveAllClick}
              className="btn btn-primary"
              style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
            >
              Save All Results
            </button>
            {optimisticStatus && (
              <span style={{ fontWeight: "600", color: optimisticStatus.includes("Error") ? "var(--color-red-500)" : "var(--color-primary-green)" }}>
                {optimisticStatus}
              </span>
            )}
          </div>
            </>
          ) : (
            <TeacherAttendance classId={selectedAssignment.ClassID} students={students} />
          )}
        </div>
      )}

      {!loading && selectedAssignment && students.length === 0 && (
        <div style={{ background: "var(--color-gray-50)", padding: "2rem", textAlign: "center", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-gray-300)" }}>
          <p style={{ color: "var(--color-gray-500)", fontWeight: "500" }}>No students are currently enrolled in this class.</p>
        </div>
      )}
    </div>
  );
}
