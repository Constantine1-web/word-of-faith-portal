import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import TeachersClient from "./TeachersClient";

export default async function AdminTeachersPage() {
  try {
    await requireCapability(["MANAGE_USERS", "MANAGE_STRUCTURE"]);
  } catch {
    redirect("/portal/unauthorized?zone=teachers");
  }

  const activeTerm = await prisma.academic_Term.findFirst({
    where: { IsActive: true },
  });

  const rawTeachers = await prisma.user.findMany({
    where: {
      OR: [
        { Role: { RoleName: { in: ["Teacher", "TEACHER", "FORM_MASTER"] } } },
        { RoleAssignments: { some: { Role: { in: ["TEACHER", "FORM_MASTER"] } } } },
      ],
    },
    orderBy: { UserID: "desc" },
    include: {
      Role: true,
      RoleAssignments: true,
      FormMasterClasses: true,
      TeacherMaps: {
        include: { Subject: true, Class: true, Term: true },
      },
    },
  });

  const teachers = rawTeachers.map(({ PasswordHash, TotpSecret, TotpBackupCodes, ...safe }) => safe);

  const classes = await prisma.class.findMany({
    include: {
      FormMaster: {
        select: { UserID: true, Email: true },
      },
    },
    orderBy: { ClassName: "asc" },
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
          marginBottom: "1.5rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
            Teacher Enrollment &amp; Subject Allocation Hub
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Add new teaching staff, assign Class Teachers, and assign subjects to classes in one place. Active Term:{" "}
            <strong>{activeTerm ? `${activeTerm.SessionName} - ${activeTerm.TermName}` : "No active term"}</strong>
          </p>
        </div>
      </div>

      <TeachersClient initialTeachers={teachers} classes={classes} subjects={subjects} activeTerm={activeTerm} />
    </div>
  );
}
