import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { signStudentVerificationToken } from "@/lib/qr-verify";
import StudentsClient from "./StudentsClient";

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  try {
    await requireCapability("MANAGE_STUDENTS");
  } catch {
    redirect("/portal/unauthorized?zone=students");
  }

  const students = await prisma.student.findMany({
    include: {
      Class: true,
      User: {
        select: {
          UserID: true,
          Email: true,
          IsActive: true,
          CreatedAt: true,
        },
      },
    },
    orderBy: { StudentID: "desc" },
  });

  const classes = await prisma.class.findMany({
    orderBy: { ClassName: "asc" },
  });

  const activeTerm = await prisma.academic_Term.findFirst({
    where: { IsActive: true },
    select: { SessionName: true },
  });

  const serializedStudents = JSON.parse(JSON.stringify(students)).map((st: any) => ({
    ...st,
    verificationSig: st?.AdmissionNo ? signStudentVerificationToken(st.AdmissionNo) : undefined,
  }));

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
        Student Directory & Direct Communications
      </h1>
      <p style={{ color: "var(--color-gray-600)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        Manage enrolled students and dispatch direct WhatsApp, SMS (via student phone numbers), and Email messages (via student portal registration emails).
      </p>
      <StudentsClient
        initialStudents={serializedStudents}
        classes={classes}
        activeSessionName={activeTerm?.SessionName || "2026/2027"}
      />
    </div>
  );
}

