import prisma from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCbtIntegrityDashboard, getCbtProviderDiagnostics } from "@/app/actions/cbt";
import {
  getAdminCbtBankAndAnalytics,
  type SchoolInternalQuestionRow,
  type CbtSubjectAnalyticsRow,
} from "@/app/actions/cbtAuthoring";
import AdminCbtClient from "./AdminCbtClient";

export const dynamic = "force-dynamic";

export default async function AdminCbtPage() {
  const session = await getServerSession(authOptions);
  const roleUpper = (session?.user?.role || "").toUpperCase();
  const isAuthorizedAdmin =
    roleUpper === "ADMIN" ||
    roleUpper === "SUPER_ADMIN" ||
    roleUpper === "PRINCIPAL" ||
    roleUpper === "BURSAR" ||
    roleUpper === "ADMISSIONS";

  if (!session || !isAuthorizedAdmin) {
    redirect("/portal/login");
  }

  let activeLocks: any[] = [];
  let recentEvents: any[] = [];
  let recentAttempts: any[] = [];
  let providerDiagnostics: any = null;
  let bankQuestions: SchoolInternalQuestionRow[] = [];
  let subjectAnalytics: CbtSubjectAnalyticsRow[] = [];
  let attemptAnalyticsRows: any[] = [];
  let internalSubjectCounts: Array<{ subjectCode: string; count: number }> = [];

  try {
    const [res, diagRes, bankRes] = await Promise.all([
      getCbtIntegrityDashboard(),
      getCbtProviderDiagnostics(),
      getAdminCbtBankAndAnalytics({ includeInactive: true }),
    ]);
    if (res.success) {
      activeLocks = res.activeLocks || [];
      recentEvents = res.recentEvents || [];
    }
    if (diagRes.success) {
      providerDiagnostics = diagRes;
    }
    if (bankRes.success) {
      bankQuestions = bankRes.questions;
      subjectAnalytics = bankRes.subjectAnalytics;
      attemptAnalyticsRows = bankRes.attemptRows;
      internalSubjectCounts = bankRes.internalSubjectCounts;
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
            CBT Integrity, ALOC Provider Keys & Question Pool
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Monitor the 2-strike CBT integrity policy, verify ALOC & Sdash API keys, synchronize the 17-subject question pool, and lift student day locks.
          </p>
        </div>
      </div>

      <AdminCbtClient
        initialActiveLocks={JSON.parse(JSON.stringify(activeLocks))}
        initialRecentAttempts={JSON.parse(JSON.stringify(recentAttempts))}
        initialRecentEvents={JSON.parse(JSON.stringify(recentEvents))}
        initialProviderDiagnostics={JSON.parse(JSON.stringify(providerDiagnostics))}
        initialBankQuestions={JSON.parse(JSON.stringify(bankQuestions))}
        initialSubjectAnalytics={JSON.parse(JSON.stringify(subjectAnalytics))}
        initialAttemptRows={JSON.parse(JSON.stringify(attemptAnalyticsRows))}
        initialInternalSubjectCounts={JSON.parse(JSON.stringify(internalSubjectCounts))}
      />
    </div>
  );
}
