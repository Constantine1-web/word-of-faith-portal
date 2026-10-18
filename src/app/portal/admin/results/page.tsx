import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminResultsClient from "./AdminResultsClient";

export default async function AdminResultsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const activeTerm = await prisma.academic_Term.findFirst({
    where: { IsActive: true }
  });

  const termId = activeTerm?.TermID || 1;

  const classes = await prisma.class.findMany({
    orderBy: { ClassName: "asc" },
    include: {
      FormMaster: true,
      _count: {
        select: {
          Students: true,
          TeacherMaps: true,
        }
      },
      SubjectSubmissions: {
        where: { TermID: termId }
      },
      Students: {
        include: {
          FormMasterReports: {
            where: { TermID: termId }
          }
        }
      }
    }
  });

  const subjects = await prisma.subject.findMany({
    orderBy: { SubjectName: "asc" }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Examination Broadsheets & Publication</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Review Form Master compilations, print official class broadsheets, and release terminal results.
          </p>
        </div>
      </div>

      <AdminResultsClient classes={classes} subjects={subjects} activeTerm={activeTerm} />
    </div>
  );
}
