"use client";

import { useState } from "react";
import { addStudent, deleteStudent } from "@/app/actions/admin";
import { FiTrash2, FiPlus } from "react-icons/fi";

export default function StudentsClient({ initialStudents, classes }: { initialStudents: any[], classes: any[] }) {
  const [students, setStudents] = useState(initialStudents);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    admissionNo: "",
    classId: classes.length > 0 ? classes[0].ClassID : 1
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await addStudent(formData);
    setLoading(false);
    if (res.success) {
      alert("Student added successfully");
      window.location.reload(); // Simple reload to get updated server data
    } else {
      alert(res.error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this student?")) return;
    const res = await deleteStudent(id);
    if (res.success) {
      setStudents(students.filter(s => s.StudentID !== id));
    } else {
      alert(res.error);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ color: "var(--color-navy-blue)" }}>All Students</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FiPlus /> Add Student
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: "white", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", display: "grid", gap: "1rem", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <input type="text" placeholder="First Name" required value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }} />
            <input type="text" placeholder="Last Name" required value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }} />
            <input type="email" placeholder="Email Address" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }} />
            <input type="text" placeholder="Admission No (e.g. WOF/2026/001)" required value={formData.admissionNo} onChange={(e) => setFormData({...formData, admissionNo: e.target.value})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }} />
          </div>
          <select value={formData.classId} onChange={(e) => setFormData({...formData, classId: parseInt(e.target.value)})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}>
            {classes.map(c => <option key={c.ClassID} value={c.ClassID}>{c.ClassName}</option>)}
          </select>
          <button type="submit" disabled={loading} className="btn btn-primary">{loading ? "Saving..." : "Save Student"}</button>
        </form>
      )}

      <div style={{ overflowX: "auto", background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-100)", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>Name</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Admission No</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Class</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Email</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.StudentID} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "1rem" }}>{s.PreferredName}</td>
                <td style={{ padding: "1rem" }}>{s.AdmissionNo}</td>
                <td style={{ padding: "1rem" }}>{s.Class?.ClassName}</td>
                <td style={{ padding: "1rem" }}>{s.User?.Email}</td>
                <td style={{ padding: "1rem", textAlign: "right" }}>
                  <button onClick={() => handleDelete(s.StudentID)} style={{ color: "red", background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }}>
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
