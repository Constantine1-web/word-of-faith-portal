"use client";

import { useState } from "react";
import { addTeacher, deleteTeacher } from "@/app/actions/admin";
import { FiTrash2, FiPlus } from "react-icons/fi";

export default function TeachersClient({ initialTeachers }: { initialTeachers: any[] }) {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await addTeacher(email);
    setLoading(false);
    if (res.success) {
      alert("Teacher added successfully with default password 'wofschools'.");
      window.location.reload();
    } else {
      alert(res.error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this teacher?")) return;
    const res = await deleteTeacher(id);
    if (res.success) {
      setTeachers(teachers.filter(t => t.UserID !== id));
    } else {
      alert(res.error);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ color: "var(--color-navy-blue)" }}>All Teachers</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FiPlus /> Add Teacher
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: "white", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", display: "grid", gap: "1rem", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
            <input type="email" placeholder="Teacher Email Address" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }} />
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>New teachers will log in using this email and the default password <strong>wofschools</strong>.</p>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "fit-content" }}>{loading ? "Saving..." : "Save Teacher"}</button>
        </form>
      )}

      <div style={{ overflowX: "auto", background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-100)", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>ID</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Email</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Assigned Subjects/Classes</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map(t => (
              <tr key={t.UserID} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "1rem" }}>#{t.UserID}</td>
                <td style={{ padding: "1rem" }}>{t.Email}</td>
                <td style={{ padding: "1rem" }}>
                  {t.TeacherMaps && t.TeacherMaps.length > 0 ? (
                    <ul style={{ paddingLeft: "1.5rem", margin: 0 }}>
                      {t.TeacherMaps.map((map: any) => (
                        <li key={map.id}>{map.Subject?.SubjectName} ({map.Class?.ClassName})</li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: "var(--color-gray-500)" }}>None assigned</span>
                  )}
                </td>
                <td style={{ padding: "1rem", textAlign: "right" }}>
                  <button onClick={() => handleDelete(t.UserID)} style={{ color: "red", background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }}>
                    <FiTrash2 />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
