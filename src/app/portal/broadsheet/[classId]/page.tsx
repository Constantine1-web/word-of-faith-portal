import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PrintButton from "@/components/PrintButton";

export default async function BroadsheetPage({ params }: { params: Promise<{ classId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role?.toLowerCase() !== "admin" && session.user.role?.toLowerCase() !== "teacher")) {
    redirect("/portal/dashboard");
  }

  const { classId } = await params;
  const cId = parseInt(classId);

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
    <div style={{ padding: "2rem", maxWidth: "1300px", margin: "0 auto", background: "white", color: "#111827", fontFamily: "Arial, sans-serif" }}>
      {/* Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }} className="no-print">
        <a href="/portal/dashboard" style={{ textDecoration: "none", color: "var(--color-navy-blue)", fontWeight: "bold" }}>
          ← Back to Dashboard
        </a>
        <PrintButton />
      </div>

      {/* School Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem", borderBottom: "2px solid #14532D", paddingBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.8rem", margin: "0 0 0.25rem 0", textTransform: "uppercase", color: "#0A2540" }}>
          WORD OF FAITH SCHOOLS
        </h1>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.5rem 0", color: "#14532D", fontWeight: "bold" }}>
          OFFICIAL TERMINAL MASTER BROAD-SHEET
        </h2>
        <div style={{ display: "flex", justifyContent: "center", gap: "2rem", fontSize: "0.9rem", color: "#374151" }}>
          <span><strong>Class:</strong> {classData.ClassName} ({classData.Level})</span>
          <span><strong>Session / Term:</strong> {activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "Active Term"}</span>
          <span><strong>Form Master:</strong> {classData.FormMaster?.Email || "Not Assigned"}</span>
        </div>
      </div>

      {/* Broadsheet Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #374151", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ background: "#F3F4F6" }}>
              <th style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "center", width: "40px" }}>Pos</th>
              <th style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "left", minWidth: "120px" }}>Reg No</th>
              <th style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "left", minWidth: "160px" }}>Student Name</th>
              {subjects.map(sub => (
                <th key={sub} style={{ border: "1px solid #374151", padding: "0.4rem", textAlign: "center", minWidth: "45px" }} title={sub}>
                  {sub.substring(0, 3).toUpperCase()}
                </th>
              ))}
              <th style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "center", minWidth: "60px", background: "#E5E7EB" }}>Total</th>
              <th style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "center", minWidth: "55px", background: "#E5E7EB" }}>Avg (%)</th>
              <th style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "left", minWidth: "200px" }}>Form Master Remark</th>
            </tr>
          </thead>
          <tbody>
            {rankedStudents.length === 0 ? (
              <tr>
                <td colSpan={subjects.length + 6} style={{ padding: "2rem", textAlign: "center", color: "#6B7280" }}>
                  No student records found in this class arm.
                </td>
              </tr>
            ) : (
              rankedStudents.map((item, idx) => (
                <tr key={item.student.StudentID} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}>
                  <td style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "center", fontWeight: "bold" }}>
                    {idx + 1}
                  </td>
                  <td style={{ border: "1px solid #374151", padding: "0.5rem", fontFamily: "monospace" }}>
                    {item.student.AdmissionNo}
                  </td>
                  <td style={{ border: "1px solid #374151", padding: "0.5rem", fontWeight: "600" }}>
                    {item.student.PreferredName || item.student.User?.Email}
                  </td>
                  {subjects.map(sub => {
                    const score = item.scoreMap[sub];
                    return (
                      <td key={sub} style={{ border: "1px solid #374151", padding: "0.4rem", textAlign: "center" }}>
                        {score !== undefined ? score : "-"}
                      </td>
                    );
                  })}
                  <td style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "center", fontWeight: "bold", background: "#F3F4F6" }}>
                    {item.totalMarks}
                  </td>
                  <td style={{ border: "1px solid #374151", padding: "0.5rem", textAlign: "center", fontWeight: "bold", background: "#F3F4F6" }}>
                    {item.average}
                  </td>
                  <td style={{ border: "1px solid #374151", padding: "0.5rem", fontSize: "0.75rem" }}>
                    {item.report?.FormMasterRemark || <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>Pending</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Signatures & Certification */}
      <div style={{ marginTop: "3rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingTop: "1.5rem" }}>
        <div style={{ textAlign: "center", width: "250px" }}>
          <div style={{ borderBottom: "1px solid black", height: "40px", marginBottom: "0.5rem" }}></div>
          <p style={{ margin: 0, fontWeight: "bold" }}>{classData.FormMaster?.Email || "Form Master"}</p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>Form Master / Class Teacher</p>
        </div>

        <div style={{ textAlign: "center", width: "250px" }}>
          <div style={{ borderBottom: "1px solid black", height: "40px", marginBottom: "0.5rem" }}></div>
          <p style={{ margin: 0, fontWeight: "bold" }}>School Principal / Director</p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>Word of Faith Schools</p>
        </div>
      </div>
    </div>
  );
}
