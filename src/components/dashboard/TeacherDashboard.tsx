"use client";

import { useState, useEffect } from "react";
import {
  getTeacherDashboardData,
  getStudentsAndScoresForSubject,
  saveSubjectScoresBatch,
  submitSubjectToFormMaster,
  saveFormMasterRemarks,
  submitClassResultsToAdmin
} from "@/app/actions/results";
import { calculateGrade } from "@/lib/grading";
import Link from "next/link";
import {
  FiCheckCircle,
  FiClock,
  FiLock,
  FiSend,
  FiSave,
  FiLayers,
  FiBookOpen,
  FiUserCheck,
  FiPrinter,
  FiStar,
  FiAlertCircle
} from "react-icons/fi";

export default function TeacherDashboard({ teacherId, initialAssignments }: { teacherId?: string; initialAssignments?: any[] }) {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Tab State: "subject-scores" vs "form-master-hub"
  const [activeTab, setActiveTab] = useState<"subject-scores" | "form-master-hub">("subject-scores");

  // Subject Score Entry State
  const [selectedAllocationId, setSelectedAllocationId] = useState<string>("");
  const [subjectStudents, setSubjectStudents] = useState<any[]>([]);
  const [scoreInputs, setScoreInputs] = useState<Record<number, { ca: string; exam: string }>>({});
  const [isSubjectSubmitted, setIsSubjectSubmitted] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingScores, setSavingScores] = useState(false);

  // Form Master Remark State
  const [selectedStudentForRemark, setSelectedStudentForRemark] = useState<any>(null);
  const [formMasterRemarkText, setFormMasterRemarkText] = useState("");
  const [principalRemarkText, setPrincipalRemarkText] = useState("");
  const [affectiveTraits, setAffectiveTraits] = useState<Record<string, number>>({
    punctuality: 5,
    neatness: 5,
    politeness: 5,
    attentiveness: 4,
    selfControl: 5
  });

  const loadData = async () => {
    setLoading(true);
    const res = await getTeacherDashboardData();
    if (res.success && res.subjectAllocations) {
      setDashboardData(res);
      if (res.subjectAllocations.length > 0 && !selectedAllocationId) {
        setSelectedAllocationId(res.subjectAllocations[0].id.toString());
      }
    } else {
      setError(res.error || "Failed to load dashboard data");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch students & current scores when subject allocation changes
  useEffect(() => {
    if (!selectedAllocationId || !dashboardData?.subjectAllocations) return;

    const allocation = dashboardData.subjectAllocations.find((a: any) => a.id.toString() === selectedAllocationId);
    if (!allocation) return;

    async function fetchScores() {
      setLoadingStudents(true);
      const res = await getStudentsAndScoresForSubject(
        allocation.ClassID,
        allocation.SubjectID,
        dashboardData.activeTerm?.TermID
      );

      if (res.success) {
        setSubjectStudents(res.students || []);
        setIsSubjectSubmitted(res.isSubmitted || false);

        // Populate score input dictionary
        const initialMap: Record<number, { ca: string; exam: string }> = {};
        res.students?.forEach((st: any) => {
          const r = st.Results?.[0];
          initialMap[st.StudentID] = {
            ca: r?.CAScore !== undefined ? r.CAScore.toString() : "",
            exam: r?.ExamScore !== undefined ? r.ExamScore.toString() : ""
          };
        });
        setScoreInputs(initialMap);
      }
      setLoadingStudents(false);
    }

    fetchScores();
  }, [selectedAllocationId, dashboardData?.activeTerm?.TermID]);

  const selectedAllocation = dashboardData?.subjectAllocations?.find(
    (a: any) => a.id.toString() === selectedAllocationId
  );

  const handleScoreChange = (studentId: number, field: "ca" | "exam", val: string) => {
    setScoreInputs(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: val
      }
    }));
  };

  const handleSaveDraft = async () => {
    if (!selectedAllocation || !dashboardData?.activeTerm) return;

    setSavingScores(true);
    setError("");
    setSuccess("");

    const payload = subjectStudents.map(st => ({
      studentId: st.StudentID,
      caScore: parseFloat(scoreInputs[st.StudentID]?.ca || "0"),
      examScore: parseFloat(scoreInputs[st.StudentID]?.exam || "0")
    }));

    const res = await saveSubjectScoresBatch({
      subjectId: selectedAllocation.SubjectID,
      classId: selectedAllocation.ClassID,
      termId: dashboardData.activeTerm.TermID,
      scores: payload
    });

    if (res.success) {
      setSuccess("Scores saved as draft successfully!");
    } else {
      setError(res.error || "Failed to save scores");
    }
    setSavingScores(false);
  };

  const handleSubmitToFormMaster = async () => {
    if (!selectedAllocation || !dashboardData?.activeTerm) return;

    const classArmName = selectedAllocation.Class?.ClassName;
    const subjectName = selectedAllocation.Subject?.SubjectName;
    const formMasterName = selectedAllocation.Class?.FormMaster?.Email || "the designated Form Master";

    if (!confirm(`Are you ready to submit final scores for ${subjectName} in ${classArmName} to ${formMasterName}?`)) return;

    setSavingScores(true);
    setError("");
    setSuccess("");

    // 1. Save scores first
    const payload = subjectStudents.map(st => ({
      studentId: st.StudentID,
      caScore: parseFloat(scoreInputs[st.StudentID]?.ca || "0"),
      examScore: parseFloat(scoreInputs[st.StudentID]?.exam || "0")
    }));

    await saveSubjectScoresBatch({
      subjectId: selectedAllocation.SubjectID,
      classId: selectedAllocation.ClassID,
      termId: dashboardData.activeTerm.TermID,
      scores: payload
    });

    // 2. Submit to Form Master
    const res = await submitSubjectToFormMaster(
      selectedAllocation.SubjectID,
      selectedAllocation.ClassID,
      dashboardData.activeTerm.TermID
    );

    if (res.success) {
      setIsSubjectSubmitted(true);
      setSuccess(`Results for ${subjectName} submitted to Form Master successfully!`);
    } else {
      setError(res.error || "Failed to submit to Form Master");
    }
    setSavingScores(false);
  };

  const openFormMasterModal = (student: any) => {
    setSelectedStudentForRemark(student);
    const existing = student.FormMasterReports?.[0];
    setFormMasterRemarkText(existing?.FormMasterRemark || "A hardworking and disciplined student with great potential.");
    setPrincipalRemarkText(existing?.PrincipalRemark || "Satisfactory academic performance. Keep it up.");
    if (existing?.AffectiveTraits) {
      try {
        setAffectiveTraits(JSON.parse(existing.AffectiveTraits));
      } catch {}
    }
  };

  const handleSaveFormMasterRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForRemark || !dashboardData?.activeTerm) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await saveFormMasterRemarks({
      studentId: selectedStudentForRemark.StudentID,
      termId: dashboardData.activeTerm.TermID,
      formMasterRemark: formMasterRemarkText,
      principalRemark: principalRemarkText,
      affectiveTraits
    });

    if (res.success) {
      setSuccess(`Remarks saved for ${selectedStudentForRemark.PreferredName || selectedStudentForRemark.AdmissionNo}`);
      setSelectedStudentForRemark(null);
      loadData();
    } else {
      setError(res.error || "Failed to save remarks");
    }
    setLoading(false);
  };

  const handleSubmitClassToAdmin = async (classId: number, className: string) => {
    if (!dashboardData?.activeTerm) return;
    if (!confirm(`Submit full compilation for ${className} to School Administration / Principal for final publication?`)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await submitClassResultsToAdmin(classId, dashboardData.activeTerm.TermID);
    if (res.success) {
      setSuccess(`Class ${className} compilation submitted to Admin for publication!`);
      loadData();
    } else {
      setError(res.error || "Failed to submit class to admin");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)" }}>
        Loading Teacher Academic Workspace...
      </div>
    );
  }

  const isTermLocked = dashboardData?.activeTerm?.IsLocked;

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Active Academic Term Clock Banner */}
      <div style={{
        background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
        color: "white",
        padding: "1.5rem 2rem",
        borderRadius: "var(--radius-lg)",
        marginBottom: "2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem",
        boxShadow: "var(--shadow-md)"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid #4ade80", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold" }}>
              TEACHER ACADEMIC SUITE
            </span>
            {isTermLocked && (
              <span style={{ background: "rgba(239, 68, 68, 0.2)", color: "#f87171", border: "1px solid #f87171", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <FiLock /> SCORE ENTRY LOCKED BY ADMIN
              </span>
            )}
          </div>
          <h2 style={{ color: "white", margin: "0.5rem 0 0 0", fontSize: "1.75rem" }}>
            {dashboardData?.activeTerm?.SessionName} — {dashboardData?.activeTerm?.TermName}
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", opacity: 0.85, fontSize: "0.9rem" }}>
            Record Continuous Assessment (CA) and Examination grades for your assigned class arms.
          </p>
        </div>

        {dashboardData?.isFormMaster && (
          <div style={{ background: "rgba(255, 255, 255, 0.15)", padding: "0.5rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
            <span style={{ color: "#4ade80", fontWeight: "bold", fontSize: "0.85rem" }}>⭐ DESIGNATED FORM MASTER</span>
            <div style={{ fontSize: "0.9rem", color: "white", fontWeight: "bold" }}>
              {dashboardData.formMasterClasses.map((c: any) => c.ClassName).join(", ")}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Mode Tabs */}
      <div style={{ display: "flex", gap: "1rem", borderBottom: "2px solid var(--color-gray-200)", marginBottom: "2rem" }}>
        <button
          onClick={() => setActiveTab("subject-scores")}
          style={{
            background: "none",
            border: "none",
            padding: "0.75rem 1rem",
            fontSize: "1.05rem",
            fontWeight: "bold",
            color: activeTab === "subject-scores" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
            borderBottom: activeTab === "subject-scores" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <FiBookOpen /> Subject Score Assembly ({dashboardData?.subjectAllocations?.length || 0} Arms)
        </button>

        {dashboardData?.isFormMaster && (
          <button
            onClick={() => setActiveTab("form-master-hub")}
            style={{
              background: "none",
              border: "none",
              padding: "0.75rem 1rem",
              fontSize: "1.05rem",
              fontWeight: "bold",
              color: activeTab === "form-master-hub" ? "var(--color-navy-blue)" : "var(--color-gray-500)",
              borderBottom: activeTab === "form-master-hub" ? "3px solid var(--color-primary-green)" : "3px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <FiUserCheck /> My Class Compilation (Form Master Hub)
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: SUBJECT TEACHER SCORE ENTRY */}
      {/* ========================================================================= */}
      {activeTab === "subject-scores" && (
        <div>
          {/* Allocation Selector */}
          <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-lg)", marginBottom: "2rem", border: "1px solid var(--color-gray-200)", boxShadow: "var(--shadow-sm)" }}>
            <label className="form-label" style={{ fontSize: "1rem", color: "var(--color-navy-blue)" }}>
              Select Assigned Class Arm & Subject:
            </label>
            <select
              className="form-input"
              value={selectedAllocationId}
              onChange={(e) => setSelectedAllocationId(e.target.value)}
              style={{ maxWidth: "500px", fontWeight: "600" }}
            >
              {dashboardData?.subjectAllocations?.map((alloc: any) => (
                <option key={alloc.id} value={alloc.id.toString()}>
                  {alloc.Class?.ClassName} — {alloc.Subject?.SubjectName} ({alloc.Subject?.ClassLevel})
                </option>
              ))}
            </select>
          </div>

          {loadingStudents ? (
            <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)" }}>
              Loading enrolled students & score sheets...
            </div>
          ) : !selectedAllocation ? (
            <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)" }}>
              No subject allocations found for your account. Please contact School Admin.
            </div>
          ) : (
            <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "1.5rem", border: "1px solid var(--color-gray-200)", boxShadow: "var(--shadow-sm)" }}>
              {/* Header Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--color-gray-100)", paddingBottom: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h3 style={{ color: "var(--color-navy-blue)", margin: 0 }}>
                      {selectedAllocation.Subject?.SubjectName}
                    </h3>
                    <span style={{ background: "#dbeafe", color: "#1e40af", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
                      {selectedAllocation.Class?.ClassName}
                    </span>
                  </div>
                  <p style={{ color: "var(--color-gray-500)", fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
                    Form Master for this Class: <strong>{selectedAllocation.Class?.FormMaster?.Email || "Not yet assigned"}</strong>
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {isSubjectSubmitted ? (
                    <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.4rem 0.8rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <FiCheckCircle /> Submitted to Form Master
                    </span>
                  ) : (
                    <span style={{ background: "#fef3c7", color: "#b45309", padding: "0.4rem 0.8rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <FiClock /> Draft in Progress
                    </span>
                  )}
                </div>
              </div>

              {/* Scores Entry Table */}
              {subjectStudents.length === 0 ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No students currently enrolled in {selectedAllocation.Class?.ClassName}.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
                    <thead>
                      <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                        <th style={{ padding: "1rem", textAlign: "left" }}>Admission No</th>
                        <th style={{ padding: "1rem", textAlign: "left" }}>Student Name</th>
                        <th style={{ padding: "1rem", textAlign: "center", width: "140px" }}>CA Score (Max 40)</th>
                        <th style={{ padding: "1rem", textAlign: "center", width: "140px" }}>Exam Score (Max 60)</th>
                        <th style={{ padding: "1rem", textAlign: "center", width: "100px" }}>Total (100)</th>
                        <th style={{ padding: "1rem", textAlign: "center", width: "100px" }}>Grade</th>
                        <th style={{ padding: "1rem", textAlign: "left", width: "160px" }}>Auto Remark</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectStudents.map((student) => {
                        const caVal = parseFloat(scoreInputs[student.StudentID]?.ca || "0") || 0;
                        const examVal = parseFloat(scoreInputs[student.StudentID]?.exam || "0") || 0;
                        const totalVal = Math.min(100, caVal + examVal);
                        const { grade, remark } = calculateGrade(totalVal);

                        return (
                          <tr key={student.StudentID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                            <td data-label="Admission No" style={{ padding: "1rem", fontFamily: "monospace", fontWeight: "bold", color: "var(--color-navy-blue)" }}>
                              {student.AdmissionNo}
                            </td>
                            <td data-label="Student Name" style={{ padding: "1rem", fontWeight: "600" }}>
                              {student.PreferredName || student.User?.Email}
                            </td>
                            <td data-label="CA Score" style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={0}
                                max={40}
                                disabled={isTermLocked || isSubjectSubmitted}
                                className="form-input"
                                style={{ width: "90px", textAlign: "center", fontWeight: "bold", margin: "0 auto" }}
                                value={scoreInputs[student.StudentID]?.ca ?? ""}
                                onChange={(e) => handleScoreChange(student.StudentID, "ca", e.target.value)}
                                placeholder="0 - 40"
                              />
                            </td>
                            <td data-label="Exam Score" style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                              <input
                                type="number"
                                min={0}
                                max={60}
                                disabled={isTermLocked || isSubjectSubmitted}
                                className="form-input"
                                style={{ width: "90px", textAlign: "center", fontWeight: "bold", margin: "0 auto" }}
                                value={scoreInputs[student.StudentID]?.exam ?? ""}
                                onChange={(e) => handleScoreChange(student.StudentID, "exam", e.target.value)}
                                placeholder="0 - 60"
                              />
                            </td>
                            <td data-label="Total" style={{ padding: "1rem", textAlign: "center", fontWeight: "bold", fontSize: "1.05rem", color: "var(--color-navy-blue)" }}>
                              {totalVal}
                            </td>
                            <td data-label="Grade" style={{ padding: "1rem", textAlign: "center" }}>
                              <span style={{
                                padding: "0.2rem 0.6rem",
                                borderRadius: "var(--radius-full)",
                                fontSize: "0.85rem",
                                fontWeight: "bold",
                                background: grade === "A" || grade === "B" ? "#dcfce7" : grade === "C" ? "#dbeafe" : grade === "D" || grade === "E" ? "#fef3c7" : "#fee2e2",
                                color: grade === "A" || grade === "B" ? "#15803d" : grade === "C" ? "#1e40af" : grade === "D" || grade === "E" ? "#b45309" : "#b91c1c"
                              }}>
                                {grade}
                              </span>
                            </td>
                            <td data-label="Remark" style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                              {remark}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", borderTop: "2px solid var(--color-gray-100)", paddingTop: "1.5rem" }}>
                <div style={{ color: "var(--color-gray-500)", fontSize: "0.85rem" }}>
                  {isTermLocked ? "⚠️ Score entry is locked by administration." : "Auto-calculated grades match WAEC / Nigerian grading standards."}
                </div>

                <div style={{ display: "flex", gap: "1rem" }}>
                  <button
                    onClick={handleSaveDraft}
                    disabled={isTermLocked || savingScores || isSubjectSubmitted}
                    className="btn btn-outline"
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
                    <FiSave /> Save Draft
                  </button>

                  <button
                    onClick={handleSubmitToFormMaster}
                    disabled={isTermLocked || savingScores || isSubjectSubmitted || subjectStudents.length === 0}
                    className="btn btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                  >
                    <FiSend /> {isSubjectSubmitted ? "Submitted to Form Master" : "Submit to Form Master"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: FORM MASTER COMPILATION & REMARKS HUB */}
      {/* ========================================================================= */}
      {activeTab === "form-master-hub" && dashboardData?.isFormMaster && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {dashboardData.formMasterClasses.map((cls: any) => {
            const totalAssignedSubjects = cls.TeacherMaps?.length || 0;
            const submittedSubjects = cls.SubjectSubmissions?.length || 0;
            const isAllSubmitted = totalAssignedSubjects > 0 && submittedSubjects >= totalAssignedSubjects;

            return (
              <div
                key={cls.ClassID}
                style={{
                  background: "var(--color-white)",
                  borderRadius: "var(--radius-lg)",
                  padding: "2rem",
                  border: "1px solid var(--color-gray-200)",
                  boxShadow: "var(--shadow-sm)"
                }}
              >
                {/* Class Arm Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--color-gray-100)", paddingBottom: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <h2 style={{ color: "var(--color-navy-blue)", margin: 0 }}>
                        {cls.ClassName} — Form Master Review
                      </h2>
                      <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.85rem", fontWeight: "bold" }}>
                        {cls.Students?.length || 0} Students Enrolled
                      </span>
                    </div>
                    <p style={{ color: "var(--color-gray-500)", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                      Review subject score submissions from subject teachers, enter Form Master remarks, and submit for final publication.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <Link
                      href={`/portal/broadsheet/${cls.ClassID}`}
                      target="_blank"
                      className="btn btn-outline"
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      <FiPrinter /> Print Official Broadsheet
                    </Link>

                    <button
                      onClick={() => handleSubmitClassToAdmin(cls.ClassID, cls.ClassName)}
                      disabled={loading}
                      className="btn btn-primary"
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      <FiCheckCircle /> Submit Class to Admin
                    </button>
                  </div>
                </div>

                {/* Subject Submission Checklist Tracker */}
                <div style={{ background: "var(--color-gray-50)", padding: "1.25rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", border: "1px solid var(--color-gray-200)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
                      Subject Score Submission Status ({submittedSubjects}/{totalAssignedSubjects})
                    </h4>
                    {isAllSubmitted ? (
                      <span style={{ color: "#16a34a", fontWeight: "bold", fontSize: "0.85rem" }}>
                        ✅ All Subjects Submitted!
                      </span>
                    ) : (
                      <span style={{ color: "#d97706", fontSize: "0.85rem" }}>
                        ⏳ Awaiting Remaining Subjects
                      </span>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
                    {cls.TeacherMaps?.map((map: any) => {
                      const isSub = cls.SubjectSubmissions?.some((s: any) => s.SubjectID === map.SubjectID);
                      return (
                        <div
                          key={map.id}
                          style={{
                            background: "var(--color-white)",
                            border: `1px solid ${isSub ? "#86efac" : "#fed7aa"}`,
                            borderRadius: "var(--radius-sm)",
                            padding: "0.5rem 0.75rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            fontSize: "0.85rem"
                          }}
                        >
                          <div>
                            <strong>{map.Subject?.SubjectName}</strong>
                            <div style={{ color: "var(--color-gray-500)", fontSize: "0.75rem" }}>
                              {map.Teacher?.Email?.split('@')[0]}
                            </div>
                          </div>
                          <span style={{
                            fontSize: "0.75rem",
                            fontWeight: "bold",
                            color: isSub ? "#15803d" : "#b45309"
                          }}>
                            {isSub ? "Submitted" : "Pending"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Students Review & Remarks Roster */}
                <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>
                  Student Performance & Form Master Remarks
                </h4>

                <div style={{ overflowX: "auto" }}>
                  <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                        <th style={{ padding: "1rem", textAlign: "left" }}>Admission No</th>
                        <th style={{ padding: "1rem", textAlign: "left" }}>Student Name</th>
                        <th style={{ padding: "1rem", textAlign: "center" }}>Subjects Taken</th>
                        <th style={{ padding: "1rem", textAlign: "center" }}>Total Score</th>
                        <th style={{ padding: "1rem", textAlign: "left" }}>Form Master Remark</th>
                        <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cls.Students?.map((student: any) => {
                        const results = student.Results || [];
                        const totalScore = results.reduce((acc: number, r: any) => acc + (r.TotalScore || 0), 0);
                        const report = student.FormMasterReports?.[0];

                        return (
                          <tr key={student.StudentID} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                            <td data-label="Admission No" style={{ padding: "1rem", fontFamily: "monospace", fontWeight: "bold" }}>
                              {student.AdmissionNo}
                            </td>
                            <td data-label="Student Name" style={{ padding: "1rem", fontWeight: "600", color: "var(--color-navy-blue)" }}>
                              {student.PreferredName || student.AdmissionNo}
                            </td>
                            <td data-label="Subjects" style={{ padding: "1rem", textAlign: "center" }}>
                              {results.length} subjects
                            </td>
                            <td data-label="Total Score" style={{ padding: "1rem", textAlign: "center", fontWeight: "bold", color: "var(--color-primary-green)" }}>
                              {totalScore}
                            </td>
                            <td data-label="Remark" style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--color-gray-700)" }}>
                              {report?.FormMasterRemark || (
                                <span style={{ color: "var(--color-gray-400)", fontStyle: "italic" }}>
                                  No remarks entered yet
                                </span>
                              )}
                            </td>
                            <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                              <button
                                onClick={() => openFormMasterModal(student)}
                                className="btn btn-outline"
                                style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                              >
                                <FiStar /> Edit Remarks
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Master Remarks & Affective Domain Modal */}
      {selectedStudentForRemark && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-floating)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem" }}>
              Form Master Assessment & Remarks
            </h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Evaluating <strong>{selectedStudentForRemark.PreferredName || selectedStudentForRemark.AdmissionNo}</strong> ({selectedStudentForRemark.AdmissionNo})
            </p>

            <form onSubmit={handleSaveFormMasterRemark}>
              <div className="form-group">
                <label className="form-label">Form Master / Class Teacher Remark</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={formMasterRemarkText}
                  onChange={(e) => setFormMasterRemarkText(e.target.value)}
                  placeholder="e.g. An exceptionally bright and well-behaved student. Keep up the enthusiasm."
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Principal Recommendation / Remark</label>
                <input
                  type="text"
                  className="form-input"
                  value={principalRemarkText}
                  onChange={(e) => setPrincipalRemarkText(e.target.value)}
                  placeholder="e.g. Excellent academic performance. Promoted to next class."
                />
              </div>

              {/* Affective Domain Ratings */}
              <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "0.75rem", fontSize: "0.95rem" }}>
                  Behavioral & Affective Domain (Rate 1 to 5)
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {Object.entries(affectiveTraits).map(([trait, rating]) => (
                    <div key={trait} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-gray-50)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius-sm)" }}>
                      <span style={{ fontSize: "0.85rem", textTransform: "capitalize" }}>{trait}:</span>
                      <select
                        value={rating}
                        onChange={(e) => setAffectiveTraits(prev => ({ ...prev, [trait]: parseInt(e.target.value) }))}
                        style={{ padding: "0.2rem 0.4rem", borderRadius: "4px", border: "1px solid var(--color-gray-300)" }}
                      >
                        <option value={5}>5 - Excellent</option>
                        <option value={4}>4 - Good</option>
                        <option value={3}>3 - Fair</option>
                        <option value={2}>2 - Poor</option>
                        <option value={1}>1 - Very Poor</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setSelectedStudentForRemark(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Saving..." : "Save Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
