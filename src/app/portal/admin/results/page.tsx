import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import AdminResultsClient from "./AdminResultsClient";

export default async function AdminResultsPage() {
  try {
    await requireCapability([
      "APPROVE_RESULTS",
      "PUBLISH_RESULTS",
      "UNLOCK_SHEETS",
      "CORRECT_SCORES",
    ]);
  } catch {
    redirect("/portal/unauthorized?zone=results");
  }

  const allTerms = await prisma.academic_Term.findMany({
    orderBy: [{ SessionName: "desc" }, { TermID: "asc" }],
  });

  const activeTerm = allTerms.find((t) => t.IsActive) || null;
  const termId = activeTerm?.TermID || 1;

  const classes = await prisma.class.findMany({
    orderBy: { ClassName: "asc" },
    include: {
      FormMaster: {
        select: { UserID: true, Email: true, IsActive: true, RoleID: true },
      },
      _count: {
        select: {
          Students: true,
          TeacherMaps: true,
        },
      },
      SubjectSubmissions: {
        where: { TermID: termId },
        include: {
          Subject: true,
          Teacher: {
            select: { UserID: true, Email: true, IsActive: true, RoleID: true },
          },
        },
      },
      Broadsheets: {
        where: { termId: termId },
      },
      Students: {
        include: {
          FormMasterReports: {
            where: { TermID: termId },
          },
        },
      },
    },
  });

  const subjects = await prisma.subject.findMany({
    orderBy: { SubjectName: "asc" },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
            Class Result Sheets &amp; Publication
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Review Class Teacher compilations, print class result sheets, and publish term results.
          </p>
        </div>
      </div>

      <AdminResultsClient
        classes={classes}
        subjects={subjects}
        activeTerm={activeTerm}
        terms={allTerms}
      />
    </div>
  );
}
