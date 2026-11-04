import Link from "next/link";
import {
  FiHome,
  FiUsers,
  FiFileText,
  FiBriefcase,
  FiLayers,
  FiCalendar,
  FiCreditCard,
  FiCheckSquare,
  FiKey,
  FiShield,
  FiBookOpen,
} from "react-icons/fi";

/** Admin Control Center sidebar contents (presentational; auth is enforced by the layout). */
export default function AdminNav({ email, roles }: { email: string; roles: Iterable<string> }) {
  const roleList = Array.from(roles);
  return (
    <>
    <div style={{ padding: "0 1.5rem", marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: "#4ade80",
          fontWeight: "bold",
          background: "rgba(74, 222, 128, 0.12)",
          padding: "0.3rem 0.65rem",
          borderRadius: "9999px",
          border: "1px solid rgba(74, 222, 128, 0.3)",
        }}
      >
        <FiShield /> Admin Control Center
      </div>
      <div
        style={{
          marginTop: "0.75rem",
          fontSize: "0.85rem",
          color: "rgba(255,255,255,0.85)",
          fontWeight: 600,
          wordBreak: "break-all",
        }}
      >
        {email}
      </div>
      <div
        style={{
          marginTop: "0.25rem",
          fontSize: "0.72rem",
          color: "#fca5a5",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        Roles: {roleList.join(" \u00B7 ")}
      </div>
    </div>

    <nav
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        padding: "0 0.75rem",
        flex: 1,
      }}
    >
      <Link
        href="/portal/admin"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "white",
          textDecoration: "none",
          borderRadius: "0.5rem",
          fontWeight: 600,
        }}
      >
        <FiHome color="#4ade80" /> Executive Overview
      </Link>
      <Link
        href="/portal/admin/terms"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiCalendar /> Sessions & Term Locks
      </Link>
      <Link
        href="/portal/admin/classes"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiLayers /> Classes & Form Masters
      </Link>
      <Link
        href="/portal/admin/teachers"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiBriefcase /> Teacher Subject Matrix
      </Link>
      <Link
        href="/portal/admin/admissions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiCheckSquare /> Admissions Pipeline
      </Link>
      <Link
        href="/portal/admin/students"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiUsers /> Student Directory
      </Link>
      <Link
        href="/portal/admin/payments"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiCreditCard /> Bursary & Fee Audit
      </Link>
      <Link
        href="/portal/admin/cards"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiKey /> Scratch Card Vault
      </Link>
      <Link
        href="/portal/admin/results"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiFileText /> Broadsheet & Results
      </Link>
      <Link
        href="/portal/admin/users"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.85rem",
          padding: "0.7rem 1rem",
          color: "rgba(255,255,255,0.88)",
          textDecoration: "none",
          borderRadius: "0.5rem",
        }}
      >
        <FiShield /> User Accounts & RBAC
      </Link>

      <div
        style={{
          marginTop: "1rem",
          paddingTop: "1rem",
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <Link
          href="/portal/teacher"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.85rem",
            padding: "0.7rem 1rem",
            color: "#93c5fd",
            background: "rgba(59, 130, 246, 0.14)",
            textDecoration: "none",
            borderRadius: "0.5rem",
            fontWeight: 600,
            fontSize: "0.88rem",
          }}
        >
          <FiBookOpen /> Supervisory Teacher View
        </Link>
      </div>
    </nav>
    </>
  );
}
