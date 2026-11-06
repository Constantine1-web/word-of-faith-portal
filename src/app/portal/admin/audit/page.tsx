import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAuditLogExplorerData } from "@/app/actions/admin";
import AuditClient from "./AuditClient";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
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

  const res = await getAuditLogExplorerData({ limit: 100 });
  const logs = res.logs || [];
  const uniqueActions = Array.from(new Set(logs.map((l) => l.Action))).sort();

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
            Tamper-Evident Audit Explorer & SHA-256 Chain Verifier
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Inspect privileged mutations, verify cryptographic hash-chain continuity, and export signed CSV audit trails.
          </p>
        </div>
      </div>

      <AuditClient
        initialLogs={JSON.parse(JSON.stringify(logs))}
        initialActions={uniqueActions}
      />
    </div>
  );
}
