import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import StudentsClient from "./StudentsClient";

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const roles: string[] = ((session?.user as any)?.roles || [role]).map((r: string) => String(r).toUpperCase());
  const isAdmin = roles.some((r) => ["ADMIN", "SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS"].includes(r));

  if (!session || !isAdmin) {
    redirect("/portal/login");
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

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
        Student Directory & Direct Communications
      </h1>
      <p style={{ color: "var(--color-gray-600)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>
        Manage enrolled students and dispatch direct WhatsApp, SMS (via student phone numbers), and Email messages (via student portal registration emails).
      </p>
      <StudentsClient initialStudents={JSON.parse(JSON.stringify(students))} classes={classes} />
    </div>
  );
}

