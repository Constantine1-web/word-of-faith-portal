"use client";

import { useState } from "react";
import { addClass, deleteClass } from "@/app/actions/admin";
import { FiTrash2, FiPlus } from "react-icons/fi";

export default function ClassesClient({ initialClasses }: { initialClasses: any[] }) {
  const [classes, setClasses] = useState(initialClasses);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  
  const [formData, setFormData] = useState({
    className: "",
    level: "Secondary"
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await addClass(formData.className, formData.level);
    setLoading(false);
    if (res.success) {
      alert("Class added successfully.");
      window.location.reload();
    } else {
      alert(res.error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this class?")) return;
    const res = await deleteClass(id);
    if (res.success) {
      setClasses(classes.filter(c => c.ClassID !== id));
    } else {
      alert(res.error);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ color: "var(--color-navy-blue)" }}>All Classes</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FiPlus /> Add Class
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: "white", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem", display: "grid", gap: "1rem", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <input type="text" placeholder="Class Name (e.g. JSS 1A)" required value={formData.className} onChange={(e) => setFormData({...formData, className: e.target.value})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }} />
            <select value={formData.level} onChange={(e) => setFormData({...formData, level: e.target.value})} style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}>
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "fit-content" }}>{loading ? "Saving..." : "Save Class"}</button>
        </form>
      )}

      <div style={{ overflowX: "auto", background: "white", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-100)", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>ID</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Class Name</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Level</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Students Enrolled</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classes.map(c => (
              <tr key={c.ClassID} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "1rem" }}>#{c.ClassID}</td>
                <td style={{ padding: "1rem", fontWeight: "bold" }}>{c.ClassName}</td>
                <td style={{ padding: "1rem" }}>{c.Level}</td>
                <td style={{ padding: "1rem", textAlign: "center" }}>
                  <span style={{ background: "var(--color-gray-100)", padding: "0.2rem 0.6rem", borderRadius: "10px" }}>{c._count.Students}</span>
                </td>
                <td style={{ padding: "1rem", textAlign: "right" }}>
                  <button onClick={() => handleDelete(c.ClassID)} style={{ color: "red", background: "none", border: "none", cursor: "pointer", padding: "0.5rem" }} title="Delete Class">
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
