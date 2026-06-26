"use client";

import { useState, useEffect } from "react";
import { markAttendance, getAttendanceForClass } from "@/app/actions/attendance";

export default function TeacherAttendance({ classId, students }: { classId: number, students: any[] }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<number, string>>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      if (!classId || students.length === 0) return;
      const res = await getAttendanceForClass(classId, date);
      if (res.success) {
        const attMap: Record<number, string> = {};
        res.attendances?.forEach((a: any) => {
          attMap[a.StudentID] = a.Status;
        });
        setAttendance(attMap);
      }
    }
    load();
  }, [classId, date, students]);

  const handleMark = async (studentId: number, currentStatus: string) => {
    const newStatus = currentStatus === "Present" ? "Absent" : currentStatus === "Absent" ? "Late" : "Present";
    
    // Optimistic UI
    setAttendance(prev => ({ ...prev, [studentId]: newStatus }));
    
    const res = await markAttendance(studentId, 1, date, newStatus);
    if (!res.success) {
      setStatus(`Failed to mark ${studentId}`);
    }
  };

  return (
    <div style={{ marginTop: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h4 style={{ color: "var(--color-navy-blue)", margin: 0 }}>Daily Attendance</h4>
        <input 
          type="date" 
          value={date} 
          onChange={(e) => setDate(e.target.value)}
          className="btn-outline"
          style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)" }}
        />
      </div>

      <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
            <th style={{ padding: "1rem", textAlign: "left" }}>Student Name</th>
            <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
            <th style={{ padding: "1rem", textAlign: "center" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {students.map(s => {
            const current = attendance[s.StudentID] || "Not Marked";
            return (
              <tr key={s.StudentID} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                <td data-label="Student Name" style={{ padding: "1rem", fontWeight: "500" }}>{s.PreferredName || s.User?.Email}</td>
                <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                  <span style={{ 
                    padding: "0.25rem 0.75rem", 
                    borderRadius: "15px", 
                    fontSize: "0.85rem",
                    background: current === "Present" ? "#d1fae5" : current === "Absent" ? "#fee2e2" : current === "Late" ? "#fef3c7" : "#f3f4f6",
                    color: current === "Present" ? "#065f46" : current === "Absent" ? "#991b1b" : current === "Late" ? "#92400e" : "#374151",
                    fontWeight: "bold"
                  }}>
                    {current}
                  </span>
                </td>
                <td data-label="Action" style={{ padding: "1rem", textAlign: "center" }}>
                  <button 
                    onClick={() => handleMark(s.StudentID, current)}
                    className="btn btn-outline"
                    style={{ padding: "0.25rem 1rem", fontSize: "0.85rem" }}
                  >
                    Toggle
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {status && <p style={{ color: "red", marginTop: "1rem" }}>{status}</p>}
    </div>
  );
}
