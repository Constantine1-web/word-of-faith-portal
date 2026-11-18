import Link from "next/link";
import { FiShieldOff, FiLock, FiArrowLeft, FiLogIn } from "react-icons/fi";

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>;
}) {
  const resolvedParams = await searchParams;
  const zone = resolvedParams?.zone === "admin" ? "Administrative Control Center" : "Teachers' Workspace";

  return (
    <div
      style={{
        minHeight: "calc(100vh - 5rem)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-secondary)",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: "540px",
          width: "100%",
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-primary)",
          borderRadius: "16px",
          padding: "2.5rem",
          boxShadow: "var(--shadow-floating)",
          textAlign: "center",
          borderTop: "6px solid #dc2626",
        }}
      >
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2.2rem",
            margin: "0 auto 1.5rem auto",
          }}
        >
          <FiShieldOff />
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
            border: "1px solid var(--status-error-border)",
            padding: "0.35rem 0.85rem",
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "1rem",
          }}
        >
          <FiLock /> 403 — Distinct Authority Required
        </span>

        <h1
          style={{
            color: "var(--text-heading)",
            fontSize: "1.65rem",
            fontWeight: 800,
            marginBottom: "0.75rem",
          }}
        >
          Access Restricted to Authorized Personnel
        </h1>

        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            marginBottom: "2rem",
          }}
        >
          This operational zone (<strong>{zone}</strong>) is strictly reserved for verified{" "}
          <strong>Word of Faith Schools</strong> teachers and school administrators. Visitors and unverified accounts cannot access this system.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <Link
            href="/portal/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              background: "var(--brand-secondary)",
              color: "var(--brand-secondary-text)",
              padding: "0.85rem 1.5rem",
              borderRadius: "8px",
              fontWeight: 600,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            <FiLogIn /> Sign In with Staff / Admin Credentials
          </Link>

          <Link
            href="/portal/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
              padding: "0.85rem 1.5rem",
              borderRadius: "8px",
              fontWeight: 600,
              textDecoration: "none",
              fontSize: "0.95rem",
            }}
          >
            Go to Student / General Portal Dashboard
          </Link>

          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              color: "var(--text-muted)",
              padding: "0.5rem",
              fontSize: "0.85rem",
              textDecoration: "none",
            }}
          >
            <FiArrowLeft /> Return to Word of Faith Schools Public Website
          </Link>
        </div>
      </div>
    </div>
  );
}
