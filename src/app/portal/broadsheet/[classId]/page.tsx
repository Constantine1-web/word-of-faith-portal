import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import PrintButton from "@/components/PrintButton";

export default async function BroadsheetPage({ params }: { params: Promise<{ classId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "teacher")) {
    redirect("/portal/dashboard");
  }

  // Await the params Promise in Next.js 15
  const { classId } = await params;
  const cId = parseInt(classId);

  const classData = await prisma.class.findUnique({
    where: { ClassID: cId },
    include: {
      Students: {
        include: {
          User: true,
          Results: {
            where: { TermID: 1 }, // Assuming Term 1 for now
            include: { Subject: true }
          }
        }
      }
    }
  });

  if (!classData) return <div>Class not found</div>;

  // Extract all unique subjects in this class from the results
  const subjectSet = new Set<string>();
  classData.Students.forEach(s => {
    s.Results.forEach(r => subjectSet.add(r.Subject.SubjectName));
  });
  const subjects = Array.from(subjectSet);

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", background: "white", color: "black", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem 0", textTransform: "uppercase" }}>Word of Faith Schools</h1>
        <h2 style={{ fontSize: "1.2rem", margin: "0 0 0.5rem 0" }}>Terminal Master Broad-Sheet</h2>
        <p style={{ margin: 0, fontWeight: "bold" }}>Class: {classData.ClassName} | Term: First Term</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse", border: "1px solid black", fontSize: "0.85rem" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid black", padding: "0.5rem", textAlign: "left", width: "5%" }}>S/N</th>
              <th style={{ border: "1px solid black", padding: "0.5rem", textAlign: "left", width: "15%" }}>Admission No</th>
              <th style={{ border: "1px solid black", padding: "0.5rem", textAlign: "left", width: "20%" }}>Student Name</th>
              {subjects.map(sub => (
                <th key={sub} style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center" }}>
                  {sub.substring(0, 3).toUpperCase()}
                </th>
              ))}
              <th style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center" }}>Total</th>
              <th style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center" }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {classData.Students.map((student, idx) => {
              let total = 0;
              const resultCells = subjects.map(sub => {
                const res = student.Results.find(r => r.Subject.SubjectName === sub);
                if (res) {
                  total += res.TotalScore;
                  return <td key={sub} data-label={sub.substring(0, 3).toUpperCase()} style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center" }}>{res.TotalScore}</td>;
                }
                return <td key={sub} data-label={sub.substring(0, 3).toUpperCase()} style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center", color: "#999" }}>-</td>;
              });

              const avg = subjects.length > 0 ? (total / subjects.length).toFixed(1) : "0.0";

              return (
                <tr key={student.StudentID}>
                  <td data-label="S/N" style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center" }}>{idx + 1}</td>
                  <td data-label="Admission No" style={{ border: "1px solid black", padding: "0.5rem" }}>{student.AdmissionNo}</td>
                  <td data-label="Student Name" style={{ border: "1px solid black", padding: "0.5rem", fontWeight: "bold" }}>{student.PreferredName || student.User?.Email}</td>
                  {resultCells}
                  <td data-label="Total" style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center", fontWeight: "bold" }}>{total}</td>
                  <td data-label="Avg" style={{ border: "1px solid black", padding: "0.5rem", textAlign: "center", fontWeight: "bold" }}>{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "2rem", display: "flex", justifyContent: "space-between" }}>
        <div>
          <p>___________________________</p>
          <p>Form Teacher's Signature</p>
        </div>
        <div>
          <p>___________________________</p>
          <p>Principal's Signature</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}} />

      <div style={{ marginTop: "2rem", textAlign: "center" }} className="no-print">
        <PrintButton />
      </div>
    </div>
  );
}
