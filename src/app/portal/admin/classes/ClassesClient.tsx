"use client";

import { useState } from "react";
import { addClassArm, assignFormMaster, deleteClass } from "@/app/actions/admin";
import { FiPlus, FiUserCheck, FiTrash2, FiLayers } from "react-icons/fi";

export default function ClassesClient({ initialClasses, teachers }: { initialClasses: any[]; teachers: any[] }) {
  const [classes, setClasses] = useState(initialClasses);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add Class Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newLevel, setNewLevel] = useState("Secondary");
  const [selectedFormMaster, setSelectedFormMaster] = useState<string>("");

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const formMasterId = selectedFormMaster ? parseInt(selectedFormMaster) : undefined;
    const res = await addClassArm(newClassName, newLevel, formMasterId);

    if (res.success && res.class) {
      const assignedTeacher = teachers.find(t => t.UserID === formMasterId);
      const newRecord = {
        ...res.class,
        FormMaster: assignedTeacher || null,
        _count: { Students: 0, TeacherMaps: 0 }
      };
      setClasses(prev => [...prev, newRecord].sort((a, b) => a.ClassName.localeCompare(b.ClassName)));
      setSuccess(`Class arm '${newClassName}' created successfully!`);
      setShowAddModal(false);
      setNewClassName("");
      setSelectedFormMaster("");
    } else {
      setError(res.error || "Failed to create class arm");
    }
    setLoading(false);
  };

  const handleAssignFormMaster = async (classId: number, teacherUserIdStr: string) => {
    setLoading(true);
    setError("");
    setSuccess("");

    const teacherUserId = teacherUserIdStr ? parseInt(teacherUserIdStr) : null;
    const res = await assignFormMaster(classId, teacherUserId);

    if (res.success) {
      const assignedTeacher = teachers.find(t => t.UserID === teacherUserId);
      setClasses(prev => prev.map(c => c.ClassID === classId ? { ...c, FormMaster: assignedTeacher || null, FormMasterID: teacherUserId } : c));
      setSuccess("Form Master allocation updated!");
    } else {
      setError(res.error || "Failed to update Form Master");
    }
    setLoading(false);
  };

  const handleDeleteClass = async (classId: number, className: string) => {
    if (!confirm(`Are you sure you want to delete '${className}'?`)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await deleteClass(classId);
    if (res.success) {
      setClasses(prev => prev.filter(c => c.ClassID !== classId));
      setSuccess(`Class '${className}' deleted.`);
    } else {
      setError(res.error || "Failed to delete class");
    }
    setLoading(false);
  };

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <FiPlus /> Add Class Arm
        </button>
      </div>

      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>Class Arm</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Level</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Designated Form Master (Class Teacher)</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Students</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No classes configured. Click "Add Class Arm" to start.
                </td>
              </tr>
            ) : (
              classes.map((cls) => (
                <tr key={cls.ClassID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                  <td data-label="Class Arm" style={{ padding: "1rem", fontWeight: "bold", color: "var(--color-navy-blue)" }}>
                    {cls.ClassName}
                  </td>
                  <td data-label="Level" style={{ padding: "1rem" }}>
                    <span style={{
                      padding: "0.2rem 0.6rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.85rem",
                      background: cls.Level.toLowerCase().includes("secondary") ? "#dbeafe" : "#fef3c7",
                      color: cls.Level.toLowerCase().includes("secondary") ? "#1e40af" : "#92400e",
                      fontWeight: "600"
                    }}>
                      {cls.Level}
                    </span>
                  </td>
                  <td data-label="Form Master" style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <select
                        value={cls.FormMasterID?.toString() || ""}
                        onChange={(e) => handleAssignFormMaster(cls.ClassID, e.target.value)}
                        disabled={loading}
                        className="form-input"
                        style={{ padding: "0.4rem 0.6rem", fontSize: "0.9rem", maxWidth: "260px" }}
                      >
                        <option value="">-- No Form Master Assigned --</option>
                        {teachers.map(t => (
                          <option key={t.UserID} value={t.UserID.toString()}>
                            {t.Email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td data-label="Students" style={{ padding: "1rem", textAlign: "center", fontWeight: "600", color: "var(--color-gray-700)" }}>
                    {cls._count?.Students || 0} enrolled
                  </td>
                  <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                    <button
                      onClick={() => handleDeleteClass(cls.ClassID, cls.ClassName)}
                      disabled={loading || cls._count?.Students > 0}
                      className="btn"
                      style={{
                        padding: "0.4rem 0.8rem",
                        fontSize: "0.85rem",
                        background: "#fee2e2",
                        color: "#b91c1c",
                        border: "none",
                        opacity: cls._count?.Students > 0 ? 0.4 : 1,
                        cursor: cls._count?.Students > 0 ? "not-allowed" : "pointer"
                      }}
                      title={cls._count?.Students > 0 ? "Cannot delete class with enrolled students" : "Delete Class"}
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Class Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "480px", boxShadow: "var(--shadow-floating)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Add New Class Arm</h3>
            <form onSubmit={handleAddClass}>
              <div className="form-group">
                <label className="form-label">Class Name / Arm</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. JSS 1 Gold, JSS 2 Blue, Primary 5 Diamond"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Academic Level</label>
                <select
                  className="form-input"
                  value={newLevel}
                  onChange={(e) => setNewLevel(e.target.value)}
                  required
                >
                  <option value="Secondary">Secondary (JSS 1 - SS 3)</option>
                  <option value="Primary">Primary (Basic 1 - Basic 6)</option>
                  <option value="Nursery / Creche">Nursery / Creche</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Initial Form Master (Optional)</label>
                <select
                  className="form-input"
                  value={selectedFormMaster}
                  onChange={(e) => setSelectedFormMaster(e.target.value)}
                >
                  <option value="">-- Assign Later --</option>
                  {teachers.map(t => (
                    <option key={t.UserID} value={t.UserID.toString()}>
                      {t.Email}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating..." : "Create Class Arm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
