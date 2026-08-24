import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ClassesClient from "./ClassesClient";

export default async function AdminClassesPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const classes = await prisma.class.findMany({
    orderBy: [{ Level: "asc" }, { ClassName: "asc" }],
    include: {
      FormMaster: true,
      _count: {
        select: {
          Students: true,
          TeacherMaps: true
        }
      }
    }
  });

  const teachers = await prisma.user.findMany({
    where: { Role: { RoleName: "Teacher" }, IsActive: true },
    orderBy: { Email: "asc" }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Classes & Form Masters</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Configure class arms (Gold, Blue, etc.) and assign 1-to-1 Form Masters (Class Teachers) in charge of final compilation.
          </p>
        </div>
      </div>

      <ClassesClient initialClasses={classes} teachers={teachers} />
    </div>
  );
}
