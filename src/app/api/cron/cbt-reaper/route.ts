import { NextResponse } from "next/server";
import { reapExpiredCbtAttempts } from "@/app/actions/cbt";
import { requireRole } from "@/lib/authz";
import { timingSafeCompare } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * HTTP endpoint for external cron jobs (e.g. Vercel Cron, Google Cloud Scheduler, or GitHub Actions)
 * to reap timed-out CBT attempts. Requires either a valid CRON_SECRET Bearer token or a SUPER_ADMIN session.
 */
export async function GET(req: Request) {
  try {
    const authHeader = (req.headers.get("authorization") || "").trim();
    const cronSecret = process.env.CRON_SECRET?.trim();

    let authorized = false;
    if (cronSecret && cronSecret.length >= 16) {
      authorized = timingSafeCompare(authHeader, `Bearer ${cronSecret}`);
    }

    if (!authorized) {
      try {
        await requireRole(["SUPER_ADMIN", "Admin"]);
        authorized = true;
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await reapExpiredCbtAttempts(50);
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reap CBT attempts" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
