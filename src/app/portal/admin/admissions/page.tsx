import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdmissionsReviewClient from "./AdmissionsReviewClient";

export default async function AdminAdmissionsPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  const applications = await prisma.admission_Application.findMany({
    orderBy: { createdAt: "desc" }
  });

  const classes = await prisma.class.findMany({
    orderBy: { ClassName: "asc" }
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>Admissions & Student Onboarding</h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Review incoming online admission applications, auto-generate registration numbers, and enroll students into class arms.
          </p>
        </div>
      </div>

      <AdmissionsReviewClient initialApplications={applications} classes={classes} />
    </div>
  );
}
