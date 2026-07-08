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
    orderBy: { ClassID: "asc" },
    include: {
      _count: {
        select: { Students: true }
      }
    }
  });

  return (
    <div>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Manage Classes</h1>
      <ClassesClient initialClasses={classes} />
    </div>
  );
}
