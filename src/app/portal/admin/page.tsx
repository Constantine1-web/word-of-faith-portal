import Link from "next/link";
import { getAdminDashboardStats } from "@/app/actions/admin";
import {
  FiUsers,
  FiCreditCard,
  FiFileText,
  FiBriefcase,
  FiShield,
  FiCalendar,
  FiCheckSquare,
  FiKey,
  FiLayers,
} from "react-icons/fi";

export default async function AdminControlCenterPage() {
  const res = await getAdminDashboardStats();
  const stats = res.stats || {
    totalStudents: 0,
    totalTeachers: 0,
    totalRevenue: 0,
    paymentCount: 0,
    pendingAdmissions: 0,
    pendingPayments: 0,
    activeTerm: "None",
  };
  const auditLogs = (res as any).recentAuditLogs || [];

  return (
    <div>
      {/* Executive Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
          color: "white",
          padding: "1.75rem 2rem",
          borderRadius: "var(--radius-lg)",
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div>
          <span
            style={{
              background: "rgba(74, 222, 128, 0.2)",
              color: "#4ade80",
              border: "1px solid #4ade80",
              padding: "0.2rem 0.65rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: "bold",
              letterSpacing: "0.05em",
            }}
          >
            ARCH-v3 HARDENED CONTROL CENTER
          </span>
          <h1 style={{ color: "white", margin: "0.5rem 0 0.25rem 0", fontSize: "1.75rem" }}>
            Word of Faith Schools — Executive Command
          </h1>
          <p style={{ margin: 0, opacity: 0.85, fontSize: "0.92rem" }}>
            Active Academic Session: <strong>{stats.activeTerm}</strong> · Layer 1–3 RBAC & Immutable Audit Trail Enabled
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/portal/admin/terms" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Manage Session & Locks
          </Link>
          <Link
            href="/portal/teacher"
            className="btn btn-outline"
            style={{ color: "white", borderColor: "rgba(255,255,255,0.4)", textDecoration: "none" }}
          >
            Open Educator Workspace
          </Link>
        </div>
      </div>

      {/* Live KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2.25rem",
        }}
      >
        <div
          style={{
            background: "var(--color-white)",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            borderLeft: "4px solid var(--color-primary-green)",
          }}
        >
          <div
            style={{
              background: "rgba(34, 197, 94, 0.1)",
              color: "var(--color-primary-green)",
              padding: "1rem",
              borderRadius: "50%",
              fontSize: "1.5rem",
            }}
          >
            <FiUsers />
          </div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.82rem", margin: 0, textTransform: "uppercase" }}>
              Enrolled Students
            </h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.75rem", fontWeight: "bold", margin: 0 }}>
              {stats.totalStudents.toLocaleString()}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            borderLeft: "4px solid #3b82f6",
          }}
        >
          <div
            style={{
              background: "rgba(59, 130, 246, 0.1)",
              color: "#3b82f6",
              padding: "1rem",
              borderRadius: "50%",
              fontSize: "1.5rem",
            }}
          >
            <FiBriefcase />
          </div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.82rem", margin: 0, textTransform: "uppercase" }}>
              Active Educators
            </h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.75rem", fontWeight: "bold", margin: 0 }}>
              {stats.totalTeachers.toLocaleString()}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            borderLeft: "4px solid #10b981",
          }}
        >
          <div
            style={{
              background: "rgba(16, 185, 129, 0.1)",
              color: "#10b981",
              padding: "1rem",
              borderRadius: "50%",
              fontSize: "1.5rem",
            }}
          >
            <FiCreditCard />
          </div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.82rem", margin: 0, textTransform: "uppercase" }}>
              Cleared Term Revenue
            </h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.75rem", fontWeight: "bold", margin: 0 }}>
              ₦{stats.totalRevenue.toLocaleString()}
            </p>
          </div>
        </div>

        <div
          style={{
            background: "var(--color-white)",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            borderLeft: "4px solid #f59e0b",
          }}
        >
          <div
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              color: "#f59e0b",
              padding: "1rem",
              borderRadius: "50%",
              fontSize: "1.5rem",
            }}
          >
            <FiFileText />
          </div>
          <div>
            <h3 style={{ color: "var(--color-gray-500)", fontSize: "0.82rem", margin: 0, textTransform: "uppercase" }}>
              Pending Actions
            </h3>
            <p style={{ color: "var(--color-navy-blue)", fontSize: "1.1rem", fontWeight: "bold", margin: "0.25rem 0 0 0" }}>
              {stats.pendingAdmissions} Admissions · {stats.pendingPayments} Tellers
            </p>
          </div>
        </div>
      </div>

      {/* Administrative Modules Grid */}
      <h2 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", fontSize: "1.2rem" }}>
        Administrative Sub-Modules
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "1rem",
          marginBottom: "2.5rem",
        }}
      >
        {[
          { title: "Session & Term Locks", desc: "Create sessions, switch active term, freeze score entry", href: "/portal/admin/terms", icon: <FiCalendar /> },
          { title: "Class Arms & Form Masters", desc: "Manage Primary/Secondary arms and Form Masters", href: "/portal/admin/classes", icon: <FiLayers /> },
          { title: "Teacher Subject Matrix", desc: "Map subject teachers to specific class arms", href: "/portal/admin/teachers", icon: <FiBriefcase /> },
          { title: "Admissions Pipeline", desc: "Review public applications and auto-enroll students", href: "/portal/admin/admissions", icon: <FiCheckSquare /> },
          { title: "Bursary & Teller Audit", desc: "Verify bank tellers and unlock student fee clearance", href: "/portal/admin/payments", icon: <FiCreditCard /> },
          { title: "Scratch Card Vault", desc: "Generate HMAC-SHA256 peppered 12-digit PIN batches", href: "/portal/admin/cards", icon: <FiKey /> },
          { title: "Master Result Broadsheets", desc: "Inspect class compilations and export CSVs", href: "/portal/admin/results", icon: <FiFileText /> },
          { title: "User Accounts & RBAC", desc: "Provision staff, reset passwords, revoke sessions", href: "/portal/admin/users", icon: <FiShield /> },
        ].map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            style={{
              background: "var(--color-white)",
              padding: "1.25rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-gray-200)",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--color-navy-blue)", fontWeight: 700 }}>
              <span style={{ color: "var(--color-primary-green)", fontSize: "1.2rem" }}>{mod.icon}</span>
              <span>{mod.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--color-gray-600)", lineHeight: 1.45 }}>
              {mod.desc}
            </p>
          </Link>
        ))}
      </div>

      {/* Append-Only Security Audit Log Feed */}
      <h2 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <FiShield color="var(--color-primary-green)" /> Immutable Security Audit Trail (PostgreSQL Trigger-Protected)
      </h2>
      <div
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)",
          overflowX: "auto",
        }}
      >
        {auditLogs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>
            No security audit events recorded yet. Actions on scores, locks, payments, and user accounts will appear here.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Timestamp</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Action</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Actor Roles</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Target Entity</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Reason / Metadata</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log: any) => (
                <tr key={String(log.id)} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--color-gray-600)", whiteSpace: "nowrap" }}>
                    {new Date(log.CreatedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--color-navy-blue)", fontFamily: "monospace" }}>
                    {log.Action}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#15803d", fontWeight: 600 }}>
                    {log.NewValue?.actorRoles || (log.ActorID ? `User #${log.ActorID}` : "SYSTEM")}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace" }}>
                    {log.Entity} #{log.EntityID}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--color-gray-600)", fontSize: "0.82rem" }}>
                    {log.NewValue?.reason || (log.NewValue ? JSON.stringify(log.NewValue).slice(0, 90) : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
