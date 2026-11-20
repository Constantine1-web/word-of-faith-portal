import Link from "next/link";
import prisma from "@/lib/db";
import { FiCheckCircle, FiAlertTriangle, FiShield, FiArrowLeft, FiAward } from "react-icons/fi";

export const dynamic = "force-dynamic";

export default async function PublicStudentVerificationPage({
  params,
}: {
  params: Promise<{ wofsId: string[] }>;
}) {
  const { wofsId: rawSegments } = await params;
  const wofsId = Array.isArray(rawSegments)
    ? rawSegments
        .map((seg) => decodeURIComponent(seg || ""))
        .join("/")
        .trim()
        .toUpperCase()
    : "";

  // Strictly query ONLY public identity confirmation fields (zero PII: no DOB, phone, email, address, results, or parent info)
  const student = wofsId
    ? await prisma.student.findFirst({
        where: {
          AdmissionNo: {
            equals: wofsId,
            mode: "insensitive",
          },
        },
        select: {
          AdmissionNo: true,
          FirstName: true,
          MiddleName: true,
          LastName: true,
          PreferredName: true,
          AvatarUrl: true,
          EnrolmentStatus: true,
          IdentityVerified: true,
          Class: {
            select: {
              ClassName: true,
              Level: true,
              Arm: true,
            },
          },
        },
      })
    : null;

  const activeTerm = await prisma.academic_Term.findFirst({
    where: { IsActive: true },
    select: { SessionName: true, TermName: true },
  });

  const displayName = student
    ? `${student.FirstName || ""} ${student.MiddleName || ""} ${student.LastName || ""}`
        .replace(/\s+/g, " ")
        .trim() ||
      student.PreferredName ||
      student.AdmissionNo
    : "";

  const initials = displayName
    ? displayName
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "W";

  const statusUpper = (student?.EnrolmentStatus || "ACTIVE").toUpperCase();
  const isActive = Boolean(student && statusUpper === "ACTIVE");
  const isGraduated = Boolean(student && statusUpper === "GRADUATED");

  return (
    <main
      style={{
        minHeight: "82vh",
        background: "var(--bg-primary)",
        padding: "clamp(1.5rem, 4vw, 3rem) 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-primary)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
            color: "#ffffff",
            padding: "1.5rem 1.75rem",
            borderBottom: "4px solid #D4AF37",
            display: "flex",
            alignItems: "center",
            gap: "0.9rem",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="Word of Faith Schools"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #D4AF37",
              background: "#ffffff",
            }}
          />
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.08em", color: "#86efac" }}>
              OFFICIAL QR IDENTITY VERIFICATION
            </div>
            <h1 style={{ margin: "0.15rem 0 0", fontSize: "1.2rem", color: "#ffffff" }}>
              Word of Faith Group of Schools
            </h1>
          </div>
        </div>

        <div style={{ padding: "1.75rem" }}>
          {!student ? (
            <div
              style={{
                background: "var(--status-error-bg)",
                border: "1px solid var(--status-error-border)",
                color: "var(--status-error-text)",
                padding: "1.5rem",
                borderRadius: "var(--radius-md)",
                textAlign: "center",
              }}
            >
              <FiAlertTriangle size={36} style={{ marginBottom: "0.5rem" }} />
              <h2 style={{ margin: "0 0 0.4rem", fontSize: "1.15rem" }}>
                Unrecognized Student Identity
              </h2>
              <p style={{ margin: 0, fontSize: "0.92rem" }}>
                No school record matches ID{" "}
                <strong style={{ fontFamily: "monospace" }}>{wofsId || "N/A"}</strong>. If you suspect a forged or damaged card, please contact the School Office.
              </p>
            </div>
          ) : (
            <>
              {/* Validity Status Banner */}
              <div
                style={{
                  background: isActive
                    ? "var(--status-success-bg)"
                    : isGraduated
                    ? "var(--status-info-bg)"
                    : "var(--status-error-bg)",
                  border: `1px solid ${
                    isActive
                      ? "var(--status-success-border)"
                      : isGraduated
                      ? "var(--status-info-border)"
                      : "var(--status-error-border)"
                  }`,
                  color: isActive
                    ? "var(--status-success-text)"
                    : isGraduated
                    ? "var(--status-info-text)"
                    : "var(--status-error-text)",
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  fontWeight: 800,
                  marginBottom: "1.4rem",
                }}
              >
                {isActive ? (
                  <FiCheckCircle size={22} />
                ) : isGraduated ? (
                  <FiAward size={22} />
                ) : (
                  <FiAlertTriangle size={22} />
                )}
                <div>
                  <div style={{ fontSize: "0.95rem" }}>
                    {isActive
                      ? "VERIFIED ACTIVE STUDENT"
                      : isGraduated
                      ? "VERIFIED GRADUATED ALUMNI"
                      : `INACTIVE RECORD (${statusUpper})`}
                  </div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.9 }}>
                    {activeTerm
                      ? `Academic Clock: ${activeTerm.SessionName} (${activeTerm.TermName})`
                      : "Verified against live school registry"}
                  </div>
                </div>
              </div>

              {/* Portrait & Non-Sensitive Identity Summary */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.25rem",
                  flexWrap: "wrap",
                  background: "var(--bg-secondary)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    width: "92px",
                    height: "110px",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "2px solid var(--brand-secondary)",
                    background: "#0A2540",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {student.AvatarUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={student.AvatarUrl}
                        alt={displayName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </>
                  ) : (
                    <span style={{ color: "#ffffff", fontSize: "1.8rem", fontWeight: 900 }}>
                      {initials}
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: "200px", display: "grid", gap: "0.55rem" }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Student Full Name
                    </div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-heading)" }}>
                      {displayName}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                      WOFS Student ID
                    </div>
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 800,
                        fontSize: "0.98rem",
                        color: "var(--status-success-text)",
                      }}
                    >
                      {student.AdmissionNo}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Current Class
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                        {student.Class?.ClassName || "Assigned"} ({student.Class?.Level || "School"})
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Registry Status
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                        {statusUpper}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
              >
                <FiShield size={14} color="var(--brand-primary)" />
                <span>
                  Privacy Notice: Private family contacts, birth dates, and academic scores are never disclosed on public verification pages.
                </span>
              </div>
            </>
          )}

          <div style={{ marginTop: "1.4rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <Link href="/" className="btn btn-outline" style={{ fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <FiArrowLeft /> Word of Faith Home
            </Link>
            <Link href="/portal/login" className="btn btn-primary" style={{ fontSize: "0.85rem" }}>
              Portal Sign In
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
