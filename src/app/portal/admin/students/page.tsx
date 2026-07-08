import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import StudentsClient from "./StudentsClient";

export default async function AdminStudentsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const students = await prisma.student.findMany({
    include: {
      Class: true,
      User: true
    },
    orderBy: { StudentID: "desc" }
  });

  const classes = await prisma.class.findMany();

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Manage Students</h1>
      <StudentsClient initialStudents={students} classes={classes} />
    </div>
  );
}
