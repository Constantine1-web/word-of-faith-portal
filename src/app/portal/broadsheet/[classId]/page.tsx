import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import { requireClassTeacherOrAdmin } from "@/lib/authz";
import {
  computeCumulativeBroadsheet,
  type CumulativeDivisorMode,
} from "@/lib/cumulative-broadsheet";
import BroadsheetControls from "@/components/portal/BroadsheetControls";

export const dynamic = "force-dynamic";

export default async function BroadsheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ mode?: string; session?: string; divisor?: string }>;
}) {
  const { classId } = await params;
  const sp = await searchParams;
  const cId = parseInt(classId, 10);
  if (!Number.isInteger(cId) || cId <= 0) {
    redirect("/portal/dashboard");
  }

  let actor;
  try {
    actor = await requireClassTeacherOrAdmin(cId);
  } catch {
    redirect("/portal/dashboard");
  }

  const isAdminViewer =
    actor.roles.has("SUPER_ADMIN") ||
    actor.roles.has("PRINCIPAL") ||
    actor.roles.has("EXAM_OFFICER") ||
    actor.roles.has("Admin");
  const backHref = isAdminViewer ? "/portal/admin/results" : "/portal/teacher";
  const backLabel = isAdminViewer ? "Results Console" : "Teacher Workspace";

  const mode: "terminal" | "cumulative" =
    sp?.mode === "cumulative" ? "cumulative" : "terminal";
  const divisorMode: CumulativeDivisorMode =
    sp?.divisor === "ALL_SESSION_TERMS" ? "ALL_SESSION_TERMS" : "ENTERED_TERMS";

  const allTerms = await prisma.academic_Term.findMany({
    orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
  });
  const sessionsAvailable = Array.from(new Set(allTerms.map((t) => t.SessionName)));
  const activeTerm = allTerms.find((t) => t.IsActive) || allTerms[0] || null;
  const termId = activeTerm?.TermID || 1;
  const targetSession =
    sp?.session && sessionsAvailable.includes(sp.session)
      ? sp.session
      : activeTerm?.SessionName || sessionsAvailable[0] || "2026/2027";

  if (mode === "cumulative") {
    const sessionTerms = allTerms.filter((t) => t.SessionName === targetSession);
    const sessionTermIds = sessionTerms.map((t) => t.TermID);

    const classData = await prisma.class.findUnique({
      where: { ClassID: cId },
      include: { FormMaster: { select: { Email: true } } },
    });

    if (!classData) return <div style={{ padding: "2rem" }}>Class not found</div>;

    const students = await prisma.student.findMany({
      where: {
        OR: [
          { ClassID: cId },
          ...(sessionTermIds.length > 0
            ? [
                {
                  Enrollments: {
                    some: { ClassID: cId, TermID: { in: sessionTermIds } },
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        Results: {
          where: sessionTermIds.length > 0 ? { TermID: { in: sessionTermIds } } : { TermID: -1 },
          include: { Subject: true },
        },
      },
      orderBy: [{ LastName: "asc" }, { FirstName: "asc" }, { StudentID: "asc" }],
    });

    const cumulative = computeCumulativeBroadsheet({
      students,
      sessionTerms,
      classLevel: classData.Level,
      passThresholdPct: 50,
      divisorMode,
    });

    const csvHeaders = [
      "Pos",
      "WOFS Student ID",
      "Student Name",
      ...cumulative.subjects.map((s) => `${s.name} (Annual Avg)`),
      "Term 1 Avg (%)",
      "Term 2 Avg (%)",
      "Term 3 Avg (%)",
      "Annual Total",
      "Annual Avg (%)",
      "Standing",
    ];
    const csvRows = cumulative.rows.map((r) => [
      r.position ?? "-",
      r.wofsStudentId,
      r.fullName,
      ...cumulative.subjects.map((s) => r.subjectCells[s.id]?.annualAvg ?? "-"),
      r.t1Average ?? "-",
      r.t2Average ?? "-",
      r.t3Average ?? "-",
      r.annualGrandTotal,
      r.annualAverage,
      r.standing,
    ]);

    return (
      <div
        style={{
          padding: "2rem",
          maxWidth: "1360px",
          margin: "0 auto",
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
          fontFamily: "var(--font-primary)",
        }}
      >
        <style>{`@media print { .no-print { display: none !important; } }`}</style>

        <BroadsheetControls
          classId={cId}
          mode="cumulative"
          sessionName={targetSession}
          sessionsAvailable={sessionsAvailable}
          divisorMode={divisorMode}
          backHref={backHref}
          backLabel={backLabel}
          csvHeaders={csvHeaders}
          csvRows={csvRows}
          csvFilename={`WOFS_Annual_Broadsheet_${classData.ClassName.replace(/\s+/g, "_")}_${targetSession.replace(/\//g, "-")}.csv`}
        />

        {/* School Header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "1.75rem",
            borderBottom: "2px solid var(--brand-accent)",
            paddingBottom: "1rem",
          }}
        >
          <h1
            style={{
              fontSize: "1.75rem",
              margin: "0 0 0.25rem 0",
              textTransform: "uppercase",
              color: "var(--text-heading)",
            }}
          >
            WORD OF FAITH SCHOOLS
          </h1>
          <h2
            style={{
              fontSize: "1.08rem",
              margin: "0 0 0.5rem 0",
              color: "var(--brand-accent)",
              fontWeight: "bold",
            }}
          >
            OFFICIAL END-OF-SESSION ANNUAL CUMULATIVE BROADSHEET
          </h2>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "0.75rem 1.5rem",
              fontSize: "0.88rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              <strong>Class:</strong> {classData.ClassName} ({classData.Level})
            </span>
            <span>
              <strong>Academic Session:</strong> {targetSession} (
              {cumulative.orderedTerms.map((t) => t.TermName).join(" / ") || "Session Terms"})
            </span>
            <span>
              <strong>Class Teacher:</strong> {classData.FormMaster?.Email || "Not Assigned"}
            </span>
            <span>
              <strong>Formula:</strong>{" "}
              {divisorMode === "ALL_SESSION_TERMS"
                ? "(T1 + T2 + T3) ÷ Full Session Terms"
                : "(T1 + T2 + T3) ÷ Terms Sat"}
            </span>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid var(--border-primary)",
              fontSize: "0.78rem",
              color: "var(--text-primary)",
            }}
          >
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", width: "38px" }}>
                  Pos
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "left", minWidth: "145px" }}>
                  WOFS Student ID
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "left", minWidth: "160px" }}>
                  Student Name
                </th>
                {cumulative.subjects.map((sub) => (
                  <th
                    key={sub.id}
                    style={{ border: "1px solid var(--border-primary)", padding: "0.35rem", textAlign: "center", minWidth: "64px" }}
                    title={`${sub.name} (T1/T2/T3 & Annual Avg)`}
                  >
                    <div>{sub.name.substring(0, 4).toUpperCase()}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 500 }}>
                      Ann (T1/T2/T3)
                    </div>
                  </th>
                ))}
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", minWidth: "50px" }}>
                  T1 %
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", minWidth: "50px" }}>
                  T2 %
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", minWidth: "50px" }}>
                  T3 %
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", minWidth: "60px", background: "var(--bg-tertiary)" }}>
                  Ann Total
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", minWidth: "62px", background: "var(--bg-tertiary)" }}>
                  Ann Avg %
                </th>
                <th style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", minWidth: "85px" }}>
                  Standing
                </th>
              </tr>
            </thead>
            <tbody>
              {cumulative.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={cumulative.subjects.length + 9}
                    style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}
                  >
                    No student cumulative scores recorded for {targetSession}.
                  </td>
                </tr>
              ) : (
                cumulative.rows.map((row, idx) => (
                  <tr
                    key={row.studentId}
                    style={{
                      background: idx % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)",
                    }}
                  >
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", fontWeight: "bold" }}>
                      {row.position ?? "—"}
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", fontFamily: "monospace", fontWeight: 700 }}>
                      {row.wofsStudentId}
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", fontWeight: 600 }}>
                      {row.fullName}
                    </td>
                    {cumulative.subjects.map((sub) => {
                      const cell = row.subjectCells[sub.id];
                      return (
                        <td
                          key={sub.id}
                          style={{ border: "1px solid var(--border-primary)", padding: "0.3rem", textAlign: "center" }}
                        >
                          {cell && cell.annualAvg !== null ? (
                            <div>
                              <div style={{ fontWeight: 800, color: "var(--text-heading)" }}>
                                {cell.annualAvg}
                              </div>
                              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                                {cell.t1 ?? "—"}/{cell.t2 ?? "—"}/{cell.t3 ?? "—"}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center" }}>
                      {row.t1Average ?? "—"}
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center" }}>
                      {row.t2Average ?? "—"}
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center" }}>
                      {row.t3Average ?? "—"}
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", fontWeight: "bold", background: "var(--bg-tertiary)" }}>
                      {row.annualGrandTotal}
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center", fontWeight: "bold", background: "var(--bg-tertiary)" }}>
                      {row.annualAverage}%
                    </td>
                    <td style={{ border: "1px solid var(--border-primary)", padding: "0.45rem", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: "999px",
                          fontSize: "0.7rem",
                          fontWeight: 800,
                          background:
                            row.standing === "PROMOTE"
                              ? "var(--status-success-bg)"
                              : row.standing === "REPEAT"
                              ? "var(--status-warning-bg)"
                              : "var(--bg-tertiary)",
                          color:
                            row.standing === "PROMOTE"
                              ? "var(--status-success-text)"
                              : row.standing === "REPEAT"
                              ? "var(--status-warning-text)"
                              : "var(--text-muted)",
                        }}
                      >
                        {row.standing}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div
          style={{
            marginTop: "2.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingTop: "1.5rem",
          }}
        >
          <div style={{ textAlign: "center", width: "min(100%, 250px)" }}>
            <div style={{ borderBottom: "1px solid var(--border-primary)", height: "40px", marginBottom: "0.5rem" }} />
            <p style={{ margin: 0, fontWeight: "bold", color: "var(--text-primary)" }}>
              {classData.FormMaster?.Email || "Class Teacher"}
            </p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Class Teacher
            </p>
          </div>

          <div style={{ textAlign: "center", width: "min(100%, 250px)" }}>
            <div style={{ borderBottom: "1px solid var(--border-primary)", height: "40px", marginBottom: "0.5rem" }} />
            <p style={{ margin: 0, fontWeight: "bold", color: "var(--text-primary)" }}>
              School Principal / Director
            </p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Word of Faith Schools
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Standard Single Active-Term Broadsheet Mode
  const classData = await prisma.class.findUnique({
    where: { ClassID: cId },
    include: {
      FormMaster: true,
      Students: {
        include: {
          User: true,
          Results: {
            where: { TermID: termId },
            include: { Subject: true },
          },
          FormMasterReports: {
            where: { TermID: termId },
          },
        },
      },
    },
  });

  if (!classData) return <div style={{ padding: "2rem" }}>Class not found</div>;

  const subjectSet = new Set<string>();
  classData.Students.forEach((s) => {
    s.Results.forEach((r) => subjectSet.add(r.Subject.SubjectName));
  });
  const subjects = Array.from(subjectSet).sort();

  const rankedStudents = classData.Students.map((student) => {
    let totalMarks = 0;
    let subjectCount = 0;
    const scoreMap: Record<string, number | "INC"> = {};
    const breakdownMap: Record<string, string> = {};

    subjects.forEach((sub) => {
      const res = student.Results.find((r) => r.Subject.SubjectName === sub);
      if (res) {
        const isIncomplete =
          res.ExamResultStatus === "PENDING" ||
          res.ExamResultStatus === "PARTIALLY_MARKED" ||
          res.Grade === "INC";
        if (isIncomplete) {
          scoreMap[sub] = "INC";
          breakdownMap[sub] = "Incomplete Hybrid Exam (Pending component)";
        } else {
          totalMarks += res.TotalScore;
          subjectCount++;
          scoreMap[sub] = res.TotalScore;
          if (res.ExamCbtTenths !== null && res.ExamTheoryTenths !== null) {
            breakdownMap[sub] = `CA: ${res.CAScore} · Exam: ${res.ExamScore} (CBT: ${res.ExamCbtTenths / 10} + Theory: ${res.ExamTheoryTenths / 10})`;
          }
        }
      }
    });

    const average = subjectCount > 0 ? parseFloat((totalMarks / subjectCount).toFixed(1)) : 0;

    return {
      student,
      scoreMap,
      breakdownMap,
      totalMarks,
      average,
      subjectCount,
      report: student.FormMasterReports[0] || null,
    };
  });

  rankedStudents.sort((a, b) => b.totalMarks - a.totalMarks);

  const terminalCsvHeaders = [
    "Pos",
    "WOFS Student ID",
    "Student Name",
    ...subjects,
    "Total",
    "Avg (%)",
    "Class Teacher Remark",
  ];
  const terminalCsvRows = rankedStudents.map((item, idx) => [
    idx + 1,
    item.student.AdmissionNo,
    item.student.PreferredName ||
      `${item.student.FirstName || ""} ${item.student.LastName || ""}`.trim() ||
      item.student.User?.Email ||
      item.student.AdmissionNo,
    ...subjects.map((sub) => item.scoreMap[sub] ?? "-"),
    item.totalMarks,
    item.average,
    item.report?.FormMasterRemark || "Pending",
  ]);

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "1300px",
        margin: "0 auto",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
        fontFamily: "var(--font-primary)",
      }}
    >
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <BroadsheetControls
        classId={cId}
        mode="terminal"
        sessionName={targetSession}
        sessionsAvailable={sessionsAvailable}
        divisorMode={divisorMode}
        backHref={backHref}
        backLabel={backLabel}
        csvHeaders={terminalCsvHeaders}
        csvRows={terminalCsvRows}
        csvFilename={`WOFS_Terminal_Broadsheet_${classData.ClassName.replace(/\s+/g, "_")}.csv`}
      />

      {/* School Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "2rem",
          borderBottom: "2px solid var(--brand-accent)",
          paddingBottom: "1rem",
        }}
      >
        <h1
          style={{
            fontSize: "1.8rem",
            margin: "0 0 0.25rem 0",
            textTransform: "uppercase",
            color: "var(--text-heading)",
          }}
        >
          WORD OF FAITH SCHOOLS
        </h1>
        <h2
          style={{
            fontSize: "1.1rem",
            margin: "0 0 0.5rem 0",
            color: "var(--brand-accent)",
            fontWeight: "bold",
          }}
        >
          OFFICIAL TERMINAL MASTER BROAD-SHEET
        </h2>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "0.75rem 1.5rem",
            fontSize: "0.9rem",
            color: "var(--text-secondary)",
          }}
        >
          <span>
            <strong>Class:</strong> {classData.ClassName} ({classData.Level})
          </span>
          <span>
            <strong>Session / Term:</strong>{" "}
            {activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "Active Term"}
          </span>
          <span>
            <strong>Class Teacher:</strong> {classData.FormMaster?.Email || "Not Assigned"}
          </span>
        </div>
      </div>

      {/* Broadsheet Table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid var(--border-primary)",
            fontSize: "0.8rem",
            color: "var(--text-primary)",
          }}
        >
          <thead>
            <tr style={{ background: "var(--bg-secondary)" }}>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", width: "40px" }}>
                Pos
              </th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "left", minWidth: "150px" }}>
                WOFS Student ID
              </th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "left", minWidth: "160px" }}>
                Student Name
              </th>
              {subjects.map((sub) => (
                <th
                  key={sub}
                  style={{ border: "1px solid var(--border-primary)", padding: "0.4rem", textAlign: "center", minWidth: "45px" }}
                  title={sub}
                >
                  {sub.substring(0, 3).toUpperCase()}
                </th>
              ))}
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", minWidth: "60px", background: "var(--bg-tertiary)" }}>
                Total
              </th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", minWidth: "55px", background: "var(--bg-tertiary)" }}>
                Avg (%)
              </th>
              <th style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "left", minWidth: "200px" }}>
                Class Teacher Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {rankedStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={subjects.length + 6}
                  style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}
                >
                  No student records found in this class arm.
                </td>
              </tr>
            ) : (
              rankedStudents.map((item, idx) => (
                <tr
                  key={item.student.StudentID}
                  style={{
                    background: idx % 2 === 0 ? "var(--bg-card)" : "var(--bg-secondary)",
                  }}
                >
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", textAlign: "center", fontWeight: "bold" }}>
                    {idx + 1}
                  </td>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", fontFamily: "monospace", fontWeight: 700 }}>
                    {item.student.AdmissionNo}
                  </td>
                  <td style={{ border: "1px solid var(--border-primary)", padding: "0.5rem", fontWeight: "600" }}>
                    {item.student.PreferredName ||
                      `${item.student.FirstName || ""} ${item.student.LastName || ""}`.trim() ||
                      item.student.User?.Email}
                  </td>
                  {subjects.map((sub) => {
                    const score = item.scoreMap[sub];
                    const detailTitle = item.breakdownMap[sub];
                    return (
                      <td
                        key={sub}
                        style={{
                          border: "1px solid var(--border-primary)",
                          padding: "0.4rem",
                          textAlign: "center",
                          color: score === "INC" ? "var(--status-warning-text)" : undefined,
                          fontWeight: score === "INC" ? 700 : undefined,
                        }}
                        title={detailTitle}
                      >
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
                    {item.report?.FormMasterRemark || (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Pending</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Signatures & Certification */}
      <div
        style={{
          marginTop: "3rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingTop: "1.5rem",
        }}
      >
        <div style={{ textAlign: "center", width: "min(100%, 250px)" }}>
          <div style={{ borderBottom: "1px solid var(--border-primary)", height: "40px", marginBottom: "0.5rem" }} />
          <p style={{ margin: 0, fontWeight: "bold", color: "var(--text-primary)" }}>
            {classData.FormMaster?.Email || "Class Teacher"}
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Class Teacher
          </p>
        </div>

        <div style={{ textAlign: "center", width: "min(100%, 250px)" }}>
          <div style={{ borderBottom: "1px solid var(--border-primary)", height: "40px", marginBottom: "0.5rem" }} />
          <p style={{ margin: 0, fontWeight: "bold", color: "var(--text-primary)" }}>
            School Principal / Director
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Word of Faith Schools
          </p>
        </div>
      </div>
    </div>
  );
}
