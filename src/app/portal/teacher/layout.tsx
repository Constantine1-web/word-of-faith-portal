import { redirect } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";
import Link from "next/link";
import { requireActiveUser } from "@/lib/authz";
import {
  FiHome,
  FiBookOpen,
  FiUserCheck,
  FiAward,
  FiMessageSquare,
  FiUser,
  FiShield,
} from "react-icons/fi";

const EDUCATOR_ROLES = [
  "TEACHER",
  "FORM_MASTER",
  "PRINCIPAL",
  "SUPER_ADMIN",
  "Teacher",
  "Admin",
];

export default async function TeacherPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor;
  try {
    actor = await requireActiveUser();
  } catch {
    redirect("/portal/login?callbackUrl=/portal/teacher");
  }

  const isAuthorized = actor.roles.some((r) => EDUCATOR_ROLES.includes(r));
  if (!isAuthorized) {
    redirect("/portal/unauthorized?zone=teacher");
  }

  const isAdminSupervisor = actor.roles.some((r) =>
    ["SUPER_ADMIN", "PRINCIPAL", "Admin"].includes(r)
  );

  return (
    <AuthProvider>
      <div style={{ display: "flex", minHeight: "calc(100vh - 4.5rem)" }}>
        {/* Educator Workspace Sidebar */}
        <aside
          style={{
            width: "265px",
            background: "linear-gradient(180deg, #0A2540 0%, #0F3456 100%)",
            color: "white",
            padding: "1.5rem 0",
            borderRight: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
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
              <FiShield /> Educator Workspace
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
              {actor.Email}
            </div>
            <div
              style={{
                marginTop: "0.25rem",
                fontSize: "0.72rem",
                color: "#93c5fd",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Roles: {actor.roles.join(" · ")}
            </div>
          </div>

          <nav
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              padding: "0 0.75rem",
              flex: 1,
            }}
          >
            <Link
              href="/portal/teacher"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                padding: "0.75rem 1rem",
                color: "white",
                textDecoration: "none",
                borderRadius: "0.5rem",
                background: "rgba(74, 222, 128, 0.15)",
                fontWeight: 600,
              }}
            >
              <FiBookOpen color="#4ade80" /> Score Entry & CA Sheets
            </Link>
            <Link
              href="/portal/teacher?tab=form-master-hub"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                padding: "0.75rem 1rem",
                color: "rgba(255,255,255,0.85)",
                textDecoration: "none",
                borderRadius: "0.5rem",
              }}
            >
              <FiUserCheck /> Form Master Hub
            </Link>
            <Link
              href="/portal/cbt"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                padding: "0.75rem 1rem",
                color: "rgba(255,255,255,0.85)",
                textDecoration: "none",
                borderRadius: "0.5rem",
              }}
            >
              <FiAward /> CBT Exam Builder
            </Link>
            <Link
              href="/portal/messages"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                padding: "0.75rem 1rem",
                color: "rgba(255,255,255,0.85)",
                textDecoration: "none",
                borderRadius: "0.5rem",
              }}
            >
              <FiMessageSquare /> Staff & Parent Comms
            </Link>
            <Link
              href="/portal/profile"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.85rem",
                padding: "0.75rem 1rem",
                color: "rgba(255,255,255,0.85)",
                textDecoration: "none",
                borderRadius: "0.5rem",
              }}
            >
              <FiUser /> Educator Profile
            </Link>

            {isAdminSupervisor && (
              <div
                style={{
                  marginTop: "1.25rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <Link
                  href="/portal/admin"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.85rem",
                    padding: "0.75rem 1rem",
                    color: "#fca5a5",
                    background: "rgba(239, 68, 68, 0.14)",
                    textDecoration: "none",
                    borderRadius: "0.5rem",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                  }}
                >
                  <FiHome /> Switch to Admin Center
                </Link>
              </div>
            )}
          </nav>
        </aside>

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            background: "var(--color-gray-50)",
            padding: "2rem",
            overflowY: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
