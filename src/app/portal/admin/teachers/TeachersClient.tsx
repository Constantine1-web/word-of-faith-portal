"use client";

import { useState } from "react";
import { assignSubjectTeacher, removeSubjectTeacherMap } from "@/app/actions/admin";
import { FiPlus, FiTrash2, FiBook, FiUser, FiLayers } from "react-icons/fi";

export default function TeachersClient({
  initialTeachers,
  classes,
  subjects,
  activeTerm
}: {
  initialTeachers: any[];
  classes: any[];
  subjects: any[];
  activeTerm: any;
}) {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Assign Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [targetTeacherId, setTargetTeacherId] = useState<string>(teachers[0]?.UserID.toString() || "");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.SubjectID.toString() || "");
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.ClassID.toString() || "");

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const teacherId = parseInt(targetTeacherId);
    const subjectId = parseInt(selectedSubjectId);
    const classId = parseInt(selectedClassId);

    const res = await assignSubjectTeacher({
      teacherId,
      subjectId,
      classId,
      termId: activeTerm?.TermID
    });

    if (res.success && res.mapping) {
      const subjectObj = subjects.find(s => s.SubjectID === subjectId);
      const classObj = classes.find(c => c.ClassID === classId);

      setTeachers(prev => prev.map(t => {
        if (t.UserID === teacherId) {
          const exists = t.TeacherMaps?.some((m: any) => m.id === res.mapping.id);
          const newMap = { ...res.mapping, Subject: subjectObj, Class: classObj, Term: activeTerm };
          return {
            ...t,
            TeacherMaps: exists ? t.TeacherMaps : [...(t.TeacherMaps || []), newMap]
          };
        }
        return t;
      }));

      setSuccess(`Assigned ${subjectObj?.SubjectName} in ${classObj?.ClassName} to teacher successfully!`);
      setShowAssignModal(false);
    } else {
      setError(res.error || "Failed to assign subject teacher");
    }
    setLoading(false);
  };

  const handleRemoveMapping = async (mapId: number, teacherId: number) => {
    if (!confirm("Are you sure you want to remove this subject assignment?")) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await removeSubjectTeacherMap(mapId);
    if (res.success) {
      setTeachers(prev => prev.map(t => {
        if (t.UserID === teacherId) {
          return {
            ...t,
            TeacherMaps: t.TeacherMaps.filter((m: any) => m.id !== mapId)
          };
        }
        return t;
      }));
      setSuccess("Subject assignment removed.");
    } else {
      setError(res.error || "Failed to remove assignment");
    }
    setLoading(false);
  };

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setShowAssignModal(true)}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          disabled={teachers.length === 0 || subjects.length === 0 || classes.length === 0}
        >
          <FiPlus /> Assign Subject to Teacher
        </button>
      </div>

      {/* Teachers & Subject Allocation List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {teachers.length === 0 ? (
          <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)", border: "1px solid var(--color-gray-200)" }}>
            No teachers found in the system. Go to <strong>User Provisioning</strong> to create teacher accounts first.
          </div>
        ) : (
          teachers.map((teacher) => (
            <div
              key={teacher.UserID}
              style={{
                background: "var(--color-white)",
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
                border: "1px solid var(--color-gray-200)",
                boxShadow: "var(--shadow-sm)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-gray-100)", paddingBottom: "1rem", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h3 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.2rem" }}>
                    {teacher.Email}
                  </h3>
                  {teacher.FormMasterClasses?.length > 0 && (
                    <span style={{ fontSize: "0.85rem", color: "#15803d", fontWeight: "bold", background: "#dcfce7", padding: "0.15rem 0.5rem", borderRadius: "var(--radius-sm)", display: "inline-block", marginTop: "0.25rem" }}>
                      ⭐ Form Master: {teacher.FormMasterClasses.map((c: any) => c.ClassName).join(", ")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setTargetTeacherId(teacher.UserID.toString());
                    setShowAssignModal(true);
                  }}
                  className="btn btn-outline"
                  style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                >
                  <FiPlus /> Assign Subject
                </button>
              </div>

              <div>
                <h4 style={{ fontSize: "0.9rem", color: "var(--color-gray-600)", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Assigned Subject Arms ({teacher.TeacherMaps?.length || 0})
                </h4>

                {(!teacher.TeacherMaps || teacher.TeacherMaps.length === 0) ? (
                  <p style={{ color: "var(--color-gray-400)", fontSize: "0.9rem", fontStyle: "italic", margin: 0 }}>
                    No subjects assigned yet for this teacher.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                    {teacher.TeacherMaps.map((map: any) => (
                      <div
                        key={map.id}
                        style={{
                          background: "var(--color-gray-50)",
                          border: "1px solid var(--color-gray-200)",
                          borderRadius: "var(--radius-md)",
                          padding: "0.5rem 0.75rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          fontSize: "0.9rem"
                        }}
                      >
                        <div>
                          <strong>{map.Subject?.SubjectName}</strong>
                          <span style={{ color: "var(--color-gray-500)", marginLeft: "0.5rem" }}>
                            ({map.Class?.ClassName})
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveMapping(map.id, teacher.UserID)}
                          disabled={loading}
                          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex", padding: 0 }}
                          title="Remove assignment"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "480px", boxShadow: "var(--shadow-floating)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Assign Subject to Teacher</h3>
            <form onSubmit={handleAssign}>
              <div className="form-group">
                <label className="form-label">Teacher</label>
                <select
                  className="form-input"
                  value={targetTeacherId}
                  onChange={(e) => setTargetTeacherId(e.target.value)}
                  required
                >
                  {teachers.map(t => (
                    <option key={t.UserID} value={t.UserID.toString()}>
                      {t.Email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <select
                  className="form-input"
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  required
                >
                  {subjects.map(s => (
                    <option key={s.SubjectID} value={s.SubjectID.toString()}>
                      {s.SubjectName} ({s.ClassLevel})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Class Arm</label>
                <select
                  className="form-input"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  required
                >
                  {classes.map(c => (
                    <option key={c.ClassID} value={c.ClassID.toString()}>
                      {c.ClassName} ({c.Level})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Assigning..." : "Confirm Allocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
