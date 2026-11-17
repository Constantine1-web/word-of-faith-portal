import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import { requireClassTeacherOrAdmin } from "@/lib/authz";
import PrintButton from "@/components/PrintButton";

export default async function BroadsheetPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const cId = parseInt(classId, 10);
  if (!Number.isInteger(cId) || cId <= 0) {
    redirect("/portal/dashboard");
  }

  try {
    await requireClassTeacherOrAdmin(cId);
  } catch {
    redirect("/portal/dashboard");
  }

  const activeTerm = await prisma.academic_Term.findFirst({
    where: { IsActive: true }
  });

  const termId = activeTerm?.TermID || 1;

  const classData = await prisma.class.findUnique({
    where: { ClassID: cId },
    include: {
      FormMaster: true,
      Students: {
        include: {
          User: true,
          Results: {
            where: { TermID: termId },
            include: { Subject: true }
          },
          FormMasterReports: {
            where: { TermID: termId }
          }
        }
      }
    }
  });

  if (!classData) return <div style={{ padding: "2rem" }}>Class not found</div>;

  // Extract all unique subjects
  const subjectSet = new Set<string>();
  classData.Students.forEach(s => {
    s.Results.forEach(r => subjectSet.add(r.Subject.SubjectName));
  });
  const subjects = Array.from(subjectSet).sort();

  // Compute student rankings
  const rankedStudents = classData.Students.map(student => {
    let totalMarks = 0;
    let subjectCount = 0;
    const scoreMap: Record<string, number> = {};

    subjects.forEach(sub => {
      const res = student.Results.find(r => r.Subject.SubjectName === sub);
      if (res) {
        totalMarks += res.TotalScore;
        subjectCount++;
        scoreMap[sub] = res.TotalScore;
      }
    });

    const average = subjectCount > 0 ? parseFloat((totalMarks / subjectCount).toFixed(1)) : 0;

    return {
      student,
      scoreMap,
      totalMarks,
      average,
      subjectCount,
      report: student.FormMasterReports[0] || null
    };
  });

  // Sort descending by totalMarks
  rankedStudents.sort((a, b) => b.totalMarks - a.totalMarks);

  return (
    <div style={{ padding: "2rem", maxWidth: "1300px", margin: "0 auto", background: "var(--bg-card)", color: "var(--text-primary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)", fontFamily: "var(--font-primary)" }}>
      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }} className="no-print">
        <a href="/portal/dashboard" style={{ textDecoration: "none", color: "var(--text-heading)", fontWeight: "bold" }}>
          ← Back to Dashboard
        </a>
        <PrintButton />
      </div>

      {/* School Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem", borderBottom: "2px solid var(--brand-accent)", paddingBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.8rem", margin: "0 0 0.25rem 0", textTransform: "uppercase", color: "var(--text-heading)" }}>
          WORD OF FAITH SCHOOLS
        </h1>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem 0", color: "var(--brand-accent)", fontWeight: "bold" }}>
          OFFICIAL TERMINAL MASTER BROAD-SHEET
        </h2>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "0.75rem 1.5rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          <span><strong>Class:</strong> {classData.ClassName} ({classData.Level})</span>
          <span><strong>Session / Term:</strong> {activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "Active Term"}</span>
          <span><strong>Form Master:</strong> {classData.FormMaster?.Email || "Not Assigned"}</span>
        </div>
      </div>

      {/* Broadsheet Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border-primary)", fontSize: "0.8rem", color: "var(--text-primary)" }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", width: "40px" }}>Pos</th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "left", minWidth: "120px" }}>Reg No</th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "left", minWidth: "160px" }}>Student Name</th>
              {subjects.map(sub => (
                <th key={sub} style={{ border: "1px solid var(--border-primary)", padding: "0.4rem", textAlign: "center", minWidth: "45px" }} title={sub}>
                  {sub.substring(0, 3).toUpperCase()}
                </th>
              ))}
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", minWidth: "60px", background: "var(--bg-tertiary)" }}>Total</th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", minWidth: "55px", background: "var(--bg-tertiary)" }}>Avg (%)</th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "left", minWidth: "200px" }}>Form Master Remark</th>
            </tr>
          </thead>
          <tbody>
            {rankedStudents.length === 0 ? (
              <tr>
                <td colSpan={subjects.length + 6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  No student records found in this class arm.
                </td>
              </tr>
            ) : (
              rankedStudents.map((item, idx) => (
                <tr key={item.student.StudentID} style={{ background: idx % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)" }}>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", fontWeight: "bold" }}>
                    {idx + 1}
                  </td>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", fontFamily: "monospace" }}>
                    {item.student.AdmissionNo}
                  </td>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", fontWeight: "600" }}>
                    {item.student.PreferredName || item.student.User?.Email}
                  </td>
                  {subjects.map(sub => {
                    const score = item.scoreMap[sub];
                    return (
                      <td key={sub} style={{ border: "1px solid var(--border-primary)", padding: "0.4rem", textAlign: "center" }}>
                        {score !== undefined ? score : "-"}
                      </td>
                    );
                  })}
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", fontWeight: "bold", background: "var(--bg-tertiary)" }}>
                    {item.totalMarks}
                  </td>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", fontWeight: "bold", background: "var(--bg-tertiary)" }}>
                    {item.average}
                  </td>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", fontSize: "0.75rem" }}>
                    {item.report?.FormMasterRemark || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Pending</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Signatures & Certification */}
      <div style={{ marginTop: "3rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: "1.5rem" }}>
        <div style={{ textAlign: "center", width: "min(100%, 250px)" }}>
          <div style={{ borderBottom: "1px solid var(--border-primary)", height: "40px", marginBottom: "0.5rem" }}></div>
          <p style={{ margin: 0, fontWeight: "bold", color: "var(--text-primary)" }}>{classData.FormMaster?.Email || "Form Master"}</p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>Form Master / Class Teacher</p>
        </div>

        <div style={{ textAlign: "center", width: "min(100%, 250px)" }}>
          <div style={{ borderBottom: "1px solid var(--border-primary)", height: "40px", marginBottom: "0.5rem" }}></div>
          <p style={{ margin: 0, fontWeight: "bold", color: "var(--text-primary)" }}>School Principal / Director</p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>Word of Faith Schools</p>
        </div>
      </div>
    </div>
  );
}
