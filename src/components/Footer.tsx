"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiMapPin,
  FiPhone,
  FiMail,
  FiClock,
  FiArrowRight,
  FiShield,
  FiAward,
} from "react-icons/fi";

export default function Footer() {
  const pathname = usePathname();

  // Do not show the public marketing footer inside authenticated portal pages
  const isPortal = pathname?.startsWith("/portal");
  if (isPortal) return null;

  return (
    <footer
      style={{
        background: "linear-gradient(180deg, #0A2540 0%, #061828 100%)",
        color: "white",
        borderTop: "3px solid var(--color-primary-green)",
        padding: "clamp(3rem, 6vw, 4.5rem) 1rem 1.5rem",
      }}
    >
      <div className="container" style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",
            gap: "2.5rem",
            marginBottom: "3rem",
          }}
        >
          {/* Column 1: School Identity & Motto */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <img
                src="/logo.jpg"
                alt="Word of Faith Schools"
                style={{ width: "48px", height: "48px", borderRadius: "8px", objectFit: "contain", background: "white", padding: "2px" }}
              />
              <div>
                <h3 style={{ margin: 0, color: "white", fontSize: "1.15rem", fontWeight: 800 }}>
                  Word of Faith Schools
                </h3>
                <span style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 700, letterSpacing: "0.5px" }}>
                  ESTABLISHED 2001 · UYO, NIGERIA
                </span>
              </div>
            </div>
            <p style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "0.88rem", lineHeight: 1.6, margin: "0 0 1.25rem 0" }}>
              A premier Christian institution committed to nurturing the total child—spirit, body, and soul. Raising leaders with academic brilliance, godly character, and practical excellence.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(34, 197, 94, 0.15)", padding: "0.4rem 0.8rem", borderRadius: "999px", border: "1px solid rgba(74, 222, 128, 0.3)" }}>
              <FiShield color="#4ade80" size={14} />
              <span style={{ fontSize: "0.76rem", color: "#86efac", fontWeight: 700 }}>
                Ministry of Education Approved
              </span>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 style={{ color: "#4ade80", fontSize: "0.95rem", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "1.25rem" }}>
              Quick Navigation
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem", fontSize: "0.88rem" }}>
              <li>
                <Link href="/" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#4ade80" /> Home Overview
                </Link>
              </li>
              <li>
                <Link href="/about" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#4ade80" /> About Our Legacy &amp; Vision
                </Link>
              </li>
              <li>
                <Link href="/academics" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#4ade80" /> Academics &amp; Curriculum
                </Link>
              </li>
              <li>
                <Link href="/admissions" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#4ade80" /> Online Admissions Application
                </Link>
              </li>
              <li>
                <Link href="/news" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#4ade80" /> School News &amp; Events
                </Link>
              </li>
              <li>
                <Link href="/contact" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#4ade80" /> Contact &amp; Campus Location
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Academic Portals */}
          <div>
            <h4 style={{ color: "#4ade80", fontSize: "0.95rem", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "1.25rem" }}>
              Student &amp; Staff Portals
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem", fontSize: "0.88rem" }}>
              <li>
                <Link href="/portal/login" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#38bdf8" /> Student &amp; Parent Portal Login
                </Link>
              </li>
              <li>
                <Link href="/portal/results" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#38bdf8" /> Check Terminal Examination Results
                </Link>
              </li>
              <li>
                <Link href="/portal/cbt" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#38bdf8" /> CBT Examination &amp; Practice Suite
                </Link>
              </li>
              <li>
                <Link href="/portal/courses" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#38bdf8" /> Lesson Notes &amp; Homework Hub
                </Link>
              </li>
              <li>
                <Link href="/portal/fees" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#38bdf8" /> Tuition &amp; Bursary Clearance
                </Link>
              </li>
              <li>
                <Link href="/portal/register" style={{ color: "rgba(255,255,255,0.8)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <FiArrowRight size={13} color="#38bdf8" /> New Student Scratch Card Activation
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact & Campus Office */}
          <div>
            <h4 style={{ color: "#4ade80", fontSize: "0.95rem", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "1.25rem" }}>
              Campus Information
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: "0.86rem", color: "rgba(255, 255, 255, 0.85)" }}>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
                <FiMapPin color="#4ade80" size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  No. 14 Enen Afaha Street, off Ikot Ekpene Road or Atiku Abubakar Road, Uyo, Akwa Ibom State, Nigeria.
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                <FiClock color="#4ade80" size={16} style={{ flexShrink: 0 }} />
                <span>Monday – Friday: 7:30 AM – 3:30 PM</span>
              </div>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                <FiMail color="#4ade80" size={16} style={{ flexShrink: 0 }} />
                <span>info@wofs.vercel.app · admissions@wofs.edu.ng</span>
              </div>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                <FiPhone color="#4ade80" size={16} style={{ flexShrink: 0 }} />
                <span>+234 802 345 6789 · +234 813 987 6543</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Strip */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            paddingTop: "1.5rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            fontSize: "0.82rem",
            color: "rgba(255, 255, 255, 0.65)",
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} Word of Faith Schools. All Rights Reserved. Built with Academic &amp; Spiritual Excellence.
          </div>
          <div style={{ display: "flex", gap: "1.25rem" }}>
            <Link href="/about" style={{ color: "rgba(255, 255, 255, 0.65)", textDecoration: "none" }}>
              Privacy &amp; Honor Code
            </Link>
            <Link href="/contact" style={{ color: "rgba(255, 255, 255, 0.65)", textDecoration: "none" }}>
              Campus Directions
            </Link>
            <Link href="/portal/login" style={{ color: "#4ade80", textDecoration: "none", fontWeight: 700 }}>
              Staff &amp; Student Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
