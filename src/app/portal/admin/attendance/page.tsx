import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getAdminSchoolAttendanceOverview } from "@/app/actions/attendance";
import AttendanceRegisterClient from "./AttendanceRegisterClient";

export const dynamic = "force-dynamic";

export default async function AdminAttendancePage() {
  try {
    await requireCapability(["MANAGE_STUDENTS", "APPROVE_RESULTS"]);
  } catch {
    redirect("/portal/unauthorized?zone=attendance");
  }

  const initialOverview = await getAdminSchoolAttendanceOverview({ thresholdPct: 80 });

  return (
    <div>
      <div
        style={{
          marginBottom: "1.75rem",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
        }}
      >
        <h1 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.75rem" }}>
          School-Wide Attendance Register &amp; Truancy Watch
        </h1>
        <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
          Monitor daily roll-call completion by class arm, audit individual attendance entries, and identify pupils below term attendance thresholds.
        </p>
      </div>

      <AttendanceRegisterClient initialOverview={initialOverview} />
    </div>
  );
}
