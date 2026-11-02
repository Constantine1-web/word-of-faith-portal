import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCbtIntegrityDashboard } from "@/app/actions/cbt";
import AdminCbtClient from "./AdminCbtClient";

export const dynamic = "force-dynamic";

export default async function AdminCbtPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "Admin" && session.user.role !== "admin")) {
    redirect("/portal/login");
  }

  let activeLocks: any[] = [];
  let recentEvents: any[] = [];
  let recentAttempts: any[] = [];

  try {
    const res = await getCbtIntegrityDashboard();
    if (res.success) {
      activeLocks = res.activeLocks || [];
      recentEvents = res.recentEvents || [];
    }
    recentAttempts = await prisma.cbtAttempt.findMany({
      include: {
        student: {
          include: { Class: true },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 40,
    });
  } catch (err) {
    console.error("[AdminCbtPage] Failed to load CBT integrity dashboard:", err);
  }

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
            CBT Integrity & Day-Lock Management
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Monitor the 2-strike CBT integrity policy, inspect active attempts, and lift student day locks with an audited reason.
          </p>
        </div>
      </div>

      <AdminCbtClient
        initialActiveLocks={JSON.parse(JSON.stringify(activeLocks))}
        initialRecentAttempts={JSON.parse(JSON.stringify(recentAttempts))}
        initialRecentEvents={JSON.parse(JSON.stringify(recentEvents))}
      />
    </div>
  );
}
