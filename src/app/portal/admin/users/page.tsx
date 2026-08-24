import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import UsersClient from "./UsersClient";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const users = await prisma.user.findMany({
    include: {
      Role: true,
      Student: {
        include: { Class: true }
      },
      FormMasterClasses: true,
      TeacherMaps: {
        include: { Subject: true, Class: true }
      }
    },
    orderBy: { UserID: "desc" }
  });

  const roles = await prisma.role.findMany();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>User Provisioning & Staff Directory</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Provision logins, reset passwords, and toggle account activation for staff, students, and administrators.
          </p>
        </div>
      </div>

      <UsersClient initialUsers={users} roles={roles} />
    </div>
  );
}
