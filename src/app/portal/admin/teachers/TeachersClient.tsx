"use client";

import { useState, useMemo } from "react";
import {
  assignSubjectTeacher,
  removeSubjectTeacherMap,
  enrollTeacherComplete,
  assignFormMaster,
} from "@/app/actions/admin";
import {
  FiPlus,
  FiTrash2,
  FiBook,
  FiUserPlus,
  FiSearch,
  FiAward,
  FiCopy,
  FiCheck,
  FiMail,
  FiRefreshCw,
  FiLayers,
} from "react-icons/fi";

export default function TeachersClient({
  initialTeachers,
  classes,
  subjects,
  activeTerm,
}: {
  initialTeachers: any[];
  classes: any[];
  subjects: any[];
  activeTerm: any;
}) {
  const [teachers, setTeachers] = useState<any[]>(initialTeachers);
  const [classList, setClassList] = useState<any[]>(classes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Newly provisioned teacher credential card
  const [provisionedCredentials, setProvisionedCredentials] = useState<{
    email: string;
    password: string;
    formMasterClass: string | null;
    subjectCount: number;
    emailSent: boolean;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // 1-Step Enroll New Teacher Wizard Modal State
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newStaffTitle, setNewStaffTitle] = useState("");
  const [newPassword, setNewPassword] = useState("Wof@Teacher2026!");
  const [newFormMasterClassId, setNewFormMasterClassId] = useState<string>("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);

  // Multi-Subject Queue inside Enroll Wizard
  const [draftSubjectId, setDraftSubjectId] = useState<string>(
    subjects[0]?.SubjectID?.toString() || ""
  );
  const [draftClassId, setDraftClassId] = useState<string>(
    classes[0]?.ClassID?.toString() || ""
  );
  const [queuedAllocations, setQueuedAllocations] = useState<
    Array<{ subjectId: number; classId: number; subjectName: string; className: string }>
  >([]);

  // Assign Subject Modal (Existing Teacher)
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [targetTeacherId, setTargetTeacherId] = useState<string>(
    teachers[0]?.UserID?.toString() || ""
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.SubjectID?.toString() || ""
  );
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classes[0]?.ClassID?.toString() || ""
  );

  // Form Master Quick Modal (Existing Teacher)
  const [showFormMasterModal, setShowFormMasterModal] = useState(false);
  const [fmTeacherId, setFmTeacherId] = useState<number | null>(null);
  const [fmClassId, setFmClassId] = useState<string>(
    classes[0]?.ClassID?.toString() || ""
  );

  // KPI metrics
  const kpis = useMemo(() => {
    const totalTeachers = teachers.length;
    const formMastersCount = teachers.filter(
      (t) => Array.isArray(t.FormMasterClasses) && t.FormMasterClasses.length > 0
    ).length;
    const totalSubjectAllocations = teachers.reduce(
      (sum, t) => sum + (Array.isArray(t.TeacherMaps) ? t.TeacherMaps.length : 0),
      0
    );
    const unassignedClassesCount = classList.filter((c) => !c.FormMasterID).length;
    return {
      totalTeachers,
      formMastersCount,
      totalSubjectAllocations,
      unassignedClassesCount,
    };
  }, [teachers, classList]);

  // Filtered teacher list
  const filteredTeachers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => {
      const emailMatch = (t.Email || "").toLowerCase().includes(q);
      const fmMatch = (t.FormMasterClasses || []).some((c: any) =>
        (c.ClassName || "").toLowerCase().includes(q)
      );
      const subMatch = (t.TeacherMaps || []).some(
        (m: any) =>
          (m.Subject?.SubjectName || "").toLowerCase().includes(q) ||
          (m.Class?.ClassName || "").toLowerCase().includes(q)
      );
      return emailMatch || fmMatch || subMatch;
    });
  }, [teachers, searchQuery]);

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let rand = "";
    for (let i = 0; i < 6; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewPassword(`Wof@${rand}!`);
  };

  const handleAddQueuedAllocation = () => {
    const sId = parseInt(draftSubjectId, 10);
    const cId = parseInt(draftClassId, 10);
    if (!sId || !cId) return;

    const exists = queuedAllocations.some(
      (item) => item.subjectId === sId && item.classId === cId
    );
    if (exists) return;

    const subObj = subjects.find((s) => s.SubjectID === sId);
    const clsObj = classList.find((c) => c.ClassID === cId);
    setQueuedAllocations((prev) => [
      ...prev,
      {
        subjectId: sId,
        classId: cId,
        subjectName: subObj?.SubjectName || `Subject #${sId}`,
        className: clsObj?.ClassName || `Class #${cId}`,
      },
    ]);
  };

  const handleRemoveQueuedAllocation = (sId: number, cId: number) => {
    setQueuedAllocations((prev) =>
      prev.filter((item) => !(item.subjectId === sId && item.classId === cId))
    );
  };

  const handleEnrollTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setProvisionedCredentials(null);

    const res = await enrollTeacherComplete({
      email: newEmail,
      password: newPassword,
      staffTitle: newStaffTitle,
      formMasterClassId: newFormMasterClassId ? parseInt(newFormMasterClassId, 10) : null,
      allocations: queuedAllocations.map((q) => ({
        subjectId: q.subjectId,
        classId: q.classId,
      })),
      sendWelcomeEmail,
    });

    if (res.success && res.teacher) {
      const fmClassIdNum = newFormMasterClassId ? parseInt(newFormMasterClassId, 10) : null;

      setTeachers((prev) => {
        // If another teacher previously held this FormMasterClass, remove it from their local state
        const cleaned = fmClassIdNum
          ? prev.map((t) => ({
              ...t,
              FormMasterClasses: (t.FormMasterClasses || []).filter(
                (c: any) => c.ClassID !== fmClassIdNum
              ),
            }))
          : prev;
        return [res.teacher, ...cleaned];
      });

      if (fmClassIdNum) {
        setClassList((prev) =>
          prev.map((c) =>
            c.ClassID === fmClassIdNum
              ? {
                  ...c,
                  FormMasterID: res.teacher.UserID,
                  FormMaster: { UserID: res.teacher.UserID, Email: res.teacher.Email },
                }
              : c
          )
        );
      }

      const fmClassObj = fmClassIdNum
        ? classList.find((c) => c.ClassID === fmClassIdNum)
        : null;

      setProvisionedCredentials({
        email: res.teacher.Email,
        password: res.generatedPassword || newPassword,
        formMasterClass: fmClassObj?.ClassName || null,
        subjectCount: res.teacher.TeacherMaps?.length || 0,
        emailSent: Boolean(res.emailSent),
      });

      setSuccess(
        `Enrolled ${res.teacher.Email} successfully with ${
          res.teacher.TeacherMaps?.length || 0
        } subject allocation(s)${
          fmClassObj ? ` and Form Master of ${fmClassObj.ClassName}` : ""
        }!`
      );
      setShowEnrollModal(false);
      setNewEmail("");
      setNewStaffTitle("");
      setNewFormMasterClassId("");
      setQueuedAllocations([]);
      generateRandomPassword();
    } else {
      setError(res.error || "Failed to enroll teacher");
    }

    setLoading(false);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const teacherId = parseInt(targetTeacherId, 10);
    const subjectId = parseInt(selectedSubjectId, 10);
    const classId = parseInt(selectedClassId, 10);

    const res = await assignSubjectTeacher({
      teacherId,
      subjectId,
      classId,
      termId: activeTerm?.TermID,
    });

    if (res.success && res.mapping) {
      const subjectObj = subjects.find((s) => s.SubjectID === subjectId);
      const classObj = classList.find((c) => c.ClassID === classId);

      setTeachers((prev) =>
        prev.map((t) => {
          if (t.UserID === teacherId) {
            const exists = t.TeacherMaps?.some((m: any) => m.id === res.mapping.id);
            const newMap = {
              ...res.mapping,
              Subject: subjectObj,
              Class: classObj,
              Term: activeTerm,
            };
            return {
              ...t,
              TeacherMaps: exists ? t.TeacherMaps : [...(t.TeacherMaps || []), newMap],
            };
          }
          return t;
        })
      );

      setSuccess(
        `Assigned ${subjectObj?.SubjectName} in ${classObj?.ClassName} to teacher successfully!`
      );
      setShowAssignModal(false);
    } else {
      setError(res.error || "Failed to assign subject teacher");
    }
    setLoading(false);
  };

  const handleAssignFormMasterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fmTeacherId || !fmClassId) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const classIdNum = parseInt(fmClassId, 10);
    const res = await assignFormMaster(classIdNum, fmTeacherId);

    if (res.success) {
      const targetClassObj = classList.find((c) => c.ClassID === classIdNum);
      const targetTeacherObj = teachers.find((t) => t.UserID === fmTeacherId);

      setTeachers((prev) =>
        prev.map((t) => {
          const withoutThisClass = (t.FormMasterClasses || []).filter(
            (c: any) => c.ClassID !== classIdNum
          );
          if (t.UserID === fmTeacherId && targetClassObj) {
            return {
              ...t,
              FormMasterClasses: [...withoutThisClass, targetClassObj],
            };
          }
          return {
            ...t,
            FormMasterClasses: withoutThisClass,
          };
        })
      );

      setClassList((prev) =>
        prev.map((c) =>
          c.ClassID === classIdNum
            ? {
                ...c,
                FormMasterID: fmTeacherId,
                FormMaster: targetTeacherObj
                  ? { UserID: targetTeacherObj.UserID, Email: targetTeacherObj.Email }
                  : null,
              }
            : c
        )
      );

      setSuccess(
        `Assigned ${targetTeacherObj?.Email || "teacher"} as Form Master of ${
          targetClassObj?.ClassName || "selected class"
        }!`
      );
      setShowFormMasterModal(false);
    } else {
      setError(res.error || "Failed to assign Form Master");
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
      setTeachers((prev) =>
        prev.map((t) => {
          if (t.UserID === teacherId) {
            return {
              ...t,
              TeacherMaps: t.TeacherMaps.filter((m: any) => m.id !== mapId),
            };
          }
          return t;
        })
      );
      setSuccess("Subject assignment removed.");
    } else {
      setError(res.error || "Failed to remove assignment");
    }
    setLoading(false);
  };

  const handleCopyCredentials = () => {
    if (!provisionedCredentials) return;
    const text = [
      `Word of Faith Group of Schools — Staff Portal Credentials`,
      `Login URL: ${window.location.origin}/portal/login`,
      `Email: ${provisionedCredentials.email}`,
      `Temporary Password: ${provisionedCredentials.password}`,
      provisionedCredentials.formMasterClass
        ? `Form Master Class: ${provisionedCredentials.formMasterClass}`
        : `Role: Subject Teacher`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
  };

  return (
    <div>
      {/* KPI Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "var(--color-white)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Active Academic Staff
          </div>
          <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-navy-blue)", marginTop: "0.25rem" }}>
            {kpis.totalTeachers}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
            Designated Form Masters
          </div>
          <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "#15803d", marginTop: "0.25rem" }}>
            {kpis.formMastersCount}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Subject-Class Allocations
          </div>
          <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-navy-blue)", marginTop: "0.25rem" }}>
            {kpis.totalSubjectAllocations}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.15rem 1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-gray-200)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Classes Without Form Master
          </div>
          <div
            style={{
              fontSize: "1.65rem",
              fontWeight: 800,
              color: kpis.unassignedClassesCount > 0 ? "#d97706" : "#15803d",
              marginTop: "0.25rem",
            }}
          >
            {kpis.unassignedClassesCount}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.25rem",
            fontWeight: "bold",
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            background: "#dcfce7",
            color: "#15803d",
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.25rem",
            fontWeight: "bold",
          }}
        >
          {success}
        </div>
      )}

      {/* Newly Provisioned Credentials Summary Card */}
      {provisionedCredentials && (
        <div
          style={{
            background: "#f0fdf4",
            border: "2px solid #22c55e",
            borderRadius: "var(--radius-lg)",
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              New Staff Account Provisioned Ready for Login
            </div>
            <div style={{ marginTop: "0.35rem", fontSize: "0.95rem", color: "#0f172a" }}>
              <strong>Email:</strong> <code>{provisionedCredentials.email}</code> &nbsp;|&nbsp;{" "}
              <strong>Temporary Password:</strong>{" "}
              <code style={{ background: "#dcfce7", padding: "2px 8px", borderRadius: "4px", fontWeight: 800, color: "#14532d" }}>
                {provisionedCredentials.password}
              </code>
            </div>
            <div style={{ marginTop: "0.25rem", fontSize: "0.82rem", color: "#475569" }}>
              {provisionedCredentials.formMasterClass
                ? `Form Master: ${provisionedCredentials.formMasterClass} • `
                : ""}
              {provisionedCredentials.subjectCount} Subject Allocation(s) •{" "}
              {provisionedCredentials.emailSent
                ? "Onboarding email dispatched via SMTP"
                : "Credentials ready to share"}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              type="button"
              onClick={handleCopyCredentials}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.55rem 1rem", fontSize: "0.85rem" }}
            >
              {copiedCreds ? <FiCheck /> : <FiCopy />}
              {copiedCreds ? "Copied!" : "Copy Login Credentials"}
            </button>
            <button
              type="button"
              onClick={() => setProvisionedCredentials(null)}
              className="btn btn-outline"
              style={{ padding: "0.55rem 0.9rem", fontSize: "0.85rem" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Search & Primary Action Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "420px" }}>
          <FiSearch
            style={{
              position: "absolute",
              left: "0.85rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#64748b",
            }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Search by teacher email, Form Master class, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: "2.4rem", margin: 0 }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            className="btn btn-outline"
            style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}
            disabled={teachers.length === 0 || subjects.length === 0 || classList.length === 0}
          >
            <FiBook /> Assign Subject to Existing Teacher
          </button>

          <button
            type="button"
            onClick={() => setShowEnrollModal(true)}
            className="btn btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#15803d",
              borderColor: "#15803d",
            }}
          >
            <FiUserPlus /> + Enroll New Teacher (1-Step Wizard)
          </button>
        </div>
      </div>

      {/* Teachers & Subject Allocation List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {filteredTeachers.length === 0 ? (
          <div
            style={{
              background: "var(--color-white)",
              padding: "3rem",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
              color: "var(--color-gray-500)",
              border: "1px solid var(--color-gray-200)",
            }}
          >
            No matching teachers found. Click <strong>&quot;+ Enroll New Teacher (1-Step Wizard)&quot;</strong> above to onboard a new teacher with their Form Master and Subject assignments.
          </div>
        ) : (
          filteredTeachers.map((teacher) => (
            <div
              key={teacher.UserID}
              style={{
                background: "var(--color-white)",
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
                border: "1px solid var(--color-gray-200)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--color-gray-100)",
                  paddingBottom: "1rem",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <h3 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.15rem" }}>
                      {teacher.Email}
                    </h3>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "0.15rem 0.55rem",
                        borderRadius: "999px",
                        background: teacher.IsActive !== false ? "#dcfce7" : "#fee2e2",
                        color: teacher.IsActive !== false ? "#166534" : "#991b1b",
                      }}
                    >
                      {teacher.IsActive !== false ? "Active Staff" : "Inactive"}
                    </span>
                  </div>

                  {teacher.FormMasterClasses?.length > 0 ? (
                    <span
                      style={{
                        fontSize: "0.82rem",
                        color: "#15803d",
                        fontWeight: "bold",
                        background: "#dcfce7",
                        padding: "0.2rem 0.65rem",
                        borderRadius: "var(--radius-sm)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        marginTop: "0.4rem",
                      }}
                    >
                      <FiAward /> Form Master: {teacher.FormMasterClasses.map((c: any) => c.ClassName).join(", ")}
                    </span>
                  ) : (
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.3rem" }}>
                      Subject Teacher (No Form Master class assigned)
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setFmTeacherId(teacher.UserID);
                      setFmClassId(
                        teacher.FormMasterClasses?.[0]?.ClassID?.toString() ||
                          classList[0]?.ClassID?.toString() ||
                          ""
                      );
                      setShowFormMasterModal(true);
                    }}
                    className="btn btn-outline"
                    style={{
                      padding: "0.4rem 0.8rem",
                      fontSize: "0.82rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <FiAward /> Assign Form Master Class
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetTeacherId(teacher.UserID.toString());
                      setShowAssignModal(true);
                    }}
                    className="btn btn-outline"
                    style={{
                      padding: "0.4rem 0.8rem",
                      fontSize: "0.82rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <FiPlus /> Assign Subject
                  </button>
                </div>
              </div>

              <div>
                <h4
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--color-gray-600)",
                    marginBottom: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Assigned Subject Arms ({teacher.TeacherMaps?.length || 0})
                </h4>

                {!teacher.TeacherMaps || teacher.TeacherMaps.length === 0 ? (
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
                          fontSize: "0.9rem",
                        }}
                      >
                        <div>
                          <strong>{map.Subject?.SubjectName}</strong>
                          <span style={{ color: "var(--color-gray-500)", marginLeft: "0.5rem" }}>
                            ({map.Class?.ClassName})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMapping(map.id, teacher.UserID)}
                          disabled={loading}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            display: "flex",
                            padding: 0,
                          }}
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

      {/* 1-STEP ENROLL NEW TEACHER WIZARD MODAL */}
      {showEnrollModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 37, 64, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              width: "100%",
              maxWidth: "620px",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "var(--shadow-floating)",
            }}
          >
            <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "0.85rem", marginBottom: "1.25rem" }}>
              <h3 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.35rem" }}>
                Enroll New Teacher &amp; Allocate Classes
              </h3>
              <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0.3rem 0 0 0" }}>
                Creates the teacher&apos;s login account, assigns an optional Form Master Class Arm, maps Subject Arms for{" "}
                <strong>{activeTerm ? `${activeTerm.SessionName} (${activeTerm.TermName})` : "the active term"}</strong>, and emails their login details.
              </p>
            </div>

            <form onSubmit={handleEnrollTeacherSubmit}>
              {/* Step 1: Credentials */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "1.1rem",
                  marginBottom: "1.15rem",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  1. Staff Identity &amp; Login Credentials
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Official Staff Email *</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="e.g. mr.okonkwo@wordoffaithschools.edu.ng"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Staff Name / Title (for Welcome Email)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Mr. Chinedu Okonkwo"
                      value={newStaffTitle}
                      onChange={(e) => setNewStaffTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: "0.85rem", marginBottom: 0 }}>
                  <label className="form-label">Initial Portal Password *</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      style={{ margin: 0, fontFamily: "monospace", fontWeight: 700 }}
                    />
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="btn btn-outline"
                      style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.35rem" }}
                    >
                      <FiRefreshCw size={14} /> Generate
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Form Master Designation */}
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "10px",
                  padding: "1.1rem",
                  marginBottom: "1.15rem",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#166534", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  2. Form Master (Class Teacher) Designation — Optional
                </div>
                <select
                  className="form-input"
                  value={newFormMasterClassId}
                  onChange={(e) => setNewFormMasterClassId(e.target.value)}
                  style={{ margin: 0, background: "white" }}
                >
                  <option value="">-- Subject Teacher Only (No Form Master Class) --</option>
                  {classList.map((c) => (
                    <option key={c.ClassID} value={c.ClassID.toString()}>
                      {c.ClassName} ({c.Level}){" "}
                      {c.FormMaster?.Email ? `— Currently: ${c.FormMaster.Email}` : "— Unassigned"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3: Multi-Subject & Class Arm Allocation Queue */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "1.1rem",
                  marginBottom: "1.15rem",
                }}
              >
                <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#0a2540", textTransform: "uppercase", marginBottom: "0.65rem" }}>
                  3. Subject &amp; Class Arm Allocations ({queuedAllocations.length} Queued)
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 180px" }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.25rem" }}>
                      Subject
                    </label>
                    <select
                      className="form-input"
                      value={draftSubjectId}
                      onChange={(e) => setDraftSubjectId(e.target.value)}
                      style={{ margin: 0 }}
                    >
                      {subjects.map((s) => (
                        <option key={s.SubjectID} value={s.SubjectID.toString()}>
                          {s.SubjectName} ({s.ClassLevel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: "1 1 140px" }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.25rem" }}>
                      Class Arm
                    </label>
                    <select
                      className="form-input"
                      value={draftClassId}
                      onChange={(e) => setDraftClassId(e.target.value)}
                      style={{ margin: 0 }}
                    >
                      {classList.map((c) => (
                        <option key={c.ClassID} value={c.ClassID.toString()}>
                          {c.ClassName} ({c.Level})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddQueuedAllocation}
                    className="btn btn-outline"
                    style={{ display: "flex", alignItems: "center", gap: "0.3rem", height: "42px" }}
                  >
                    <FiPlus /> Add Subject Arm
                  </button>
                </div>

                {queuedAllocations.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.85rem" }}>
                    {queuedAllocations.map((q) => (
                      <span
                        key={`${q.subjectId}-${q.classId}`}
                        style={{
                          background: "#e0f2fe",
                          color: "#0369a1",
                          border: "1px solid #bae6fd",
                          borderRadius: "999px",
                          padding: "0.3rem 0.75rem",
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                        }}
                      >
                        {q.subjectName} ({q.className})
                        <button
                          type="button"
                          onClick={() => handleRemoveQueuedAllocation(q.subjectId, q.classId)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#0369a1",
                            cursor: "pointer",
                            fontWeight: 800,
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.65rem", fontStyle: "italic" }}>
                    Select a Subject and Class Arm above and click &quot;+ Add Subject Arm&quot; to pre-assign classes now (or assign them later).
                  </div>
                )}
              </div>

              {/* Step 4: Email Notification Toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  fontSize: "0.88rem",
                  color: "#1e293b",
                  cursor: "pointer",
                  marginBottom: "1.5rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={sendWelcomeEmail}
                  onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                <FiMail style={{ color: "#15803d" }} />
                <span>
                  Send official <strong>Welcome &amp; Portal Login Credentials Email</strong> via SMTP immediately
                </span>
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowEnrollModal(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ background: "#15803d", borderColor: "#15803d" }}
                >
                  {loading ? "Enrolling Teacher..." : "Complete Teacher Enrollment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN SUBJECT TO EXISTING TEACHER MODAL */}
      {showAssignModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "var(--shadow-floating)",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>
              Assign Subject to Teacher
            </h3>
            <form onSubmit={handleAssign}>
              <div className="form-group">
                <label className="form-label">Teacher</label>
                <select
                  className="form-input"
                  value={targetTeacherId}
                  onChange={(e) => setTargetTeacherId(e.target.value)}
                  required
                >
                  {teachers.map((t) => (
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
                  {subjects.map((s) => (
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
                  {classList.map((c) => (
                    <option key={c.ClassID} value={c.ClassID.toString()}>
                      {c.ClassName} ({c.Level})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAssignModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Assigning..." : "Confirm Allocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK FORM MASTER ASSIGNMENT MODAL */}
      {showFormMasterModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              padding: "2rem",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "var(--shadow-floating)",
            }}
          >
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
              Assign Form Master Class Arm
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "1.25rem" }}>
              Designating a teacher as Form Master unlocks their Class Broadsheet, Affective/Psychomotor Grading, and Daily Roll Call Attendance for that class.
            </p>
            <form onSubmit={handleAssignFormMasterSubmit}>
              <div className="form-group">
                <label className="form-label">Select Class Arm</label>
                <select
                  className="form-input"
                  value={fmClassId}
                  onChange={(e) => setFmClassId(e.target.value)}
                  required
                >
                  {classList.map((c) => (
                    <option key={c.ClassID} value={c.ClassID.toString()}>
                      {c.ClassName} ({c.Level}){" "}
                      {c.FormMaster?.Email ? `— Current: ${c.FormMaster.Email}` : "— Unassigned"}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowFormMasterModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Saving..." : "Assign Form Master"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

