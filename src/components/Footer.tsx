"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiMapPin, FiPhone, FiMail, FiClock } from "react-icons/fi";

export default function Footer() {
  const pathname = usePathname();

  // Do not show the public marketing footer inside authenticated portal pages
  const isPortal = pathname?.startsWith("/portal");
  if (isPortal) return null;

  return (
    <footer
      style={{
        background: "var(--footer-bg)",
        color: "var(--footer-text)",
        borderTop: "3px solid var(--brand-primary)",
        padding: "clamp(2.25rem, 4vw, 3rem) 1rem 1.25rem",
      }}
    >
      <div className="container" style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: "2rem",
            marginBottom: "2rem",
          }}
        >
          {/* Column 1: School Identity */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <img
                src="/logo.jpg"
                alt="Word of Faith Schools"
                style={{ width: "42px", height: "42px", borderRadius: "8px", objectFit: "contain", background: "white", padding: "2px" }}
              />
              <div>
                <h3 style={{ margin: 0, color: "white", fontSize: "1.1rem", fontWeight: 800 }}>
                  Word of Faith Schools
                </h3>
                <span style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 700 }}>
                  Creche · Nursery · Primary · Secondary
                </span>
              </div>
            </div>
            <p style={{ color: "var(--footer-muted)", fontSize: "0.86rem", lineHeight: 1.55, margin: 0 }}>
              Nurturing the total child in spirit, body, and soul through sound moral values and academic excellence.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 style={{ color: "#4ade80", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "0.85rem" }}>
              Quick Links
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1rem", fontSize: "0.86rem" }}>
              <li>
                <Link href="/" style={{ color: "var(--footer-muted)", textDecoration: "none" }}>Home</Link>
              </li>
              <li>
                <Link href="/about" style={{ color: "var(--footer-muted)", textDecoration: "none" }}>About Us</Link>
              </li>
              <li>
                <Link href="/academics" style={{ color: "var(--footer-muted)", textDecoration: "none" }}>Academics</Link>
              </li>
              <li>
                <Link href="/admissions" style={{ color: "var(--footer-muted)", textDecoration: "none" }}>Admissions</Link>
              </li>
              <li>
                <Link href="/news" style={{ color: "var(--footer-muted)", textDecoration: "none" }}>News &amp; Events</Link>
              </li>
              <li>
                <Link href="/contact" style={{ color: "var(--footer-muted)", textDecoration: "none" }}>Contact Us</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: School Office & Contact */}
          <div>
            <h4 style={{ color: "#4ade80", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "0.85rem" }}>
              School Office
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", fontSize: "0.85rem", color: "var(--footer-text)" }}>
              <div style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start" }}>
                <FiMapPin color="#4ade80" size={15} style={{ flexShrink: 0, marginTop: "3px" }} />
                <span>No. 14 Enen Afaha Street, Uyo, Akwa Ibom State</span>
              </div>
              <div style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                <FiClock color="#4ade80" size={15} style={{ flexShrink: 0 }} />
                <span>Mon – Fri: 7:30 AM – 3:30 PM</span>
              </div>
              <div style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                <FiPhone color="#4ade80" size={15} style={{ flexShrink: 0 }} />
                <span>+234 802 345 6789</span>
              </div>
              <div style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                <FiMail color="#4ade80" size={15} style={{ flexShrink: 0 }} />
                <span>info@wofs.vercel.app</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Strip */}
        <div
          style={{
            borderTop: "1px solid var(--footer-border)",
            paddingTop: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "0.8rem",
            color: "var(--footer-muted)",
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} Word of Faith Schools. All Rights Reserved.
          </div>
          <Link href="/portal/login" style={{ color: "#4ade80", textDecoration: "none", fontWeight: 700 }}>
            School Portal Login &rarr;
          </Link>
        </div>
      </div>
    </footer>
  );
}
