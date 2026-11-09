"use client";

import { useEffect, useState, useMemo } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { getCourseMaterials, type CourseMaterialItem } from "@/app/actions/elearning";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  FiBookOpen,
  FiFileText,
  FiClock,
  FiPrinter,
  FiPlayCircle,
  FiUser,
  FiCheckCircle,
} from "react-icons/fi";

export default function CoursesPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [academics, setAcademics] = useState<any[]>([]);
  const [materials, setMaterials] = useState<CourseMaterialItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [activeMaterial, setActiveMaterial] = useState<CourseMaterialItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (session?.user) {
        const userId = parseInt((session.user as any).id, 10);
        const res = await getStudentProfile(userId);
        let classId: number | undefined = undefined;
        let className: string | undefined = undefined;
        if (res.success) {
          setProfile(res.student);
          setAcademics(res.academics || []);
          className = res.student?.className;
        }
        const matRes = await getCourseMaterials(classId, className);
        if (matRes.success) {
          setMaterials(matRes.materials || []);
        }
        setLoading(false);
      }
    }
    load();
  }, [session]);

  const filteredMaterials = useMemo(() => {
    if (selectedCategory === "All") return materials;
    return materials.filter((m) => m.category === selectedCategory);
  }, [materials, selectedCategory]);

  const handlePrintMaterial = (mat: CourseMaterialItem) => {
    const win = window.open("", "_blank", "width=850,height=900");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${mat.title} — Word of Faith Schools</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 36px; color: #0f172a; line-height: 1.65; }
            .header { border-bottom: 3px double #15803d; padding-bottom: 14px; margin-bottom: 22px; }
            .school { font-size: 12px; font-weight: 800; color: #15803d; text-transform: uppercase; letter-spacing: 1px; }
            h1 { color: #0a2540; margin: 6px 0; font-size: 22px; }
            .meta { font-size: 13px; color: #475569; display: flex; gap: 18px; flex-wrap: wrap; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 20px; }
            .content { white-space: pre-wrap; font-size: 14.5px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="school">Word of Faith Group of Schools — E-Learning &amp; Study Repository</div>
            <h1>${mat.title}</h1>
          </div>
          <div class="meta">
            <div><strong>Subject:</strong> ${mat.subjectName}</div>
            <div><strong>Class:</strong> ${mat.className}</div>
            <div><strong>Category:</strong> ${mat.category}</div>
            <div><strong>Week:</strong> ${mat.weekLabel}</div>
            ${mat.dueDate ? `<div><strong>Due Date:</strong> ${mat.dueDate}</div>` : ""}
          </div>
          <div class="content">${mat.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  if (loading) {
    return <div style={{ padding: "2rem" }}>Loading courses, lesson notes, and study materials...</div>;
  }

  return (
    <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "2px solid var(--color-gray-200)",
          paddingBottom: "1rem",
          marginBottom: "1.75rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ color: "var(--color-navy-blue)", margin: 0 }}>
            My Courses, Lesson Notes &amp; Assignments
          </h1>
          <p style={{ color: "var(--color-gray-600)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Registered subjects, weekly teacher lesson notes, revision summaries, and homework tasks for{" "}
            <strong>{profile?.className || "your class"}</strong>.
          </p>
        </div>

        <Link
          href="/portal/cbt"
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", textDecoration: "none" }}
        >
          <FiPlayCircle /> Practice Subjects in CBT Center
        </Link>
      </div>

      {/* Section 1: Digital Lesson Notes, Revision Guides & Homework Hub */}
      <div
        style={{
          background: "var(--color-white)",
          padding: "clamp(1rem, 2.5vw, 1.75rem)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <h2 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiBookOpen style={{ color: "#15803d" }} /> E-Learning Lesson Notes &amp; Homework Assignments
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.86rem", margin: "0.2rem 0 0 0" }}>
              Published directly by your subject teachers. Click any study card to read or print the full note.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            {["All", "Lesson Note", "Homework Assignment", "Revision Summary"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "0.4rem 0.85rem",
                  borderRadius: "999px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: selectedCategory === cat ? "1px solid #0A2540" : "1px solid #cbd5e1",
                  background: selectedCategory === cat ? "#0A2540" : "#f8fafc",
                  color: selectedCategory === cat ? "white" : "#334155",
                }}
              >
                {cat === "All" ? "All Materials" : `${cat}s`}
              </button>
            ))}
          </div>
        </div>

        {filteredMaterials.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "10px" }}>
            No materials published in this category yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
              gap: "1rem",
            }}
          >
            {filteredMaterials.map((mat) => {
              const isHomework = mat.category === "Homework Assignment";
              const isRevision = mat.category === "Revision Summary";
              return (
                <div
                  key={mat.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderTop: `4px solid ${isHomework ? "#d97706" : isRevision ? "#7c3aed" : "#15803d"}`,
                    borderRadius: "10px",
                    padding: "1.2rem",
                    background: "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.85rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          padding: "0.18rem 0.6rem",
                          borderRadius: "999px",
                          background: isHomework ? "#fef3c7" : isRevision ? "#f3e8ff" : "#dcfce7",
                          color: isHomework ? "#b45309" : isRevision ? "#6d28d9" : "#166534",
                        }}
                      >
                        {mat.category}
                      </span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>
                        {mat.weekLabel} • {mat.className}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#0284c7", textTransform: "uppercase" }}>
                      {mat.subjectName}
                    </div>
                    <h3 style={{ color: "#0A2540", fontSize: "1.05rem", margin: "0.25rem 0 0.5rem 0" }}>
                      {mat.title}
                    </h3>
                    <p
                      style={{
                        color: "#475569",
                        fontSize: "0.85rem",
                        margin: 0,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        whiteSpace: "pre-line",
                      }}
                    >
                      {mat.content}
                    </p>
                  </div>

                  <div>
                    {mat.dueDate && (
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "#b45309",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          marginBottom: "0.65rem",
                        }}
                      >
                        <FiClock /> Due: {mat.dueDate}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => setActiveMaterial(mat)}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: "0.45rem 0.75rem", fontSize: "0.82rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}
                      >
                        <FiFileText /> Open Study Note
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintMaterial(mat)}
                        className="btn btn-outline"
                        style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                        title="Print or Save as PDF"
                      >
                        <FiPrinter /> PDF
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Registered Subjects & Assigned Teachers Table */}
      <div
        style={{
          background: "var(--color-white)",
          padding: "clamp(1rem, 2.5vw, 2rem)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)",
        }}
      >
        <h2 style={{ color: "var(--color-navy-blue)", margin: "0 0 0.35rem 0", fontSize: "1.2rem" }}>
          Registered Academic Subjects &amp; Subject Teachers
        </h2>
        <p style={{ marginBottom: "1.25rem", color: "var(--color-gray-600)", fontSize: "0.9rem" }}>
          Your active term subject registrations and assigned academic staff.
        </p>

        <div className="table-scroll">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
            <thead>
              <tr style={{ background: "#0A2540", color: "white", textAlign: "left" }}>
                <th style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Subject Code</th>
                <th style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Subject Name</th>
                <th style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Assigned Teacher</th>
                <th style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", textTransform: "uppercase" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {academics.length > 0 ? (
                academics.map((ac, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                    <td style={{ padding: "0.9rem 1rem", color: "var(--color-gray-600)", fontFamily: "monospace", fontWeight: 700 }}>
                      {(ac.subject || "SUB").slice(0, 3).toUpperCase()}-10{idx + 1}
                    </td>
                    <td style={{ padding: "0.9rem 1rem", fontWeight: 700, color: "#0A2540" }}>{ac.subject}</td>
                    <td style={{ padding: "0.9rem 1rem", color: "var(--color-gray-700)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <FiUser style={{ color: "#64748b" }} /> {ac.teacher}
                    </td>
                    <td style={{ padding: "0.9rem 1rem", color: "#15803d", fontWeight: 700 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                        <FiCheckCircle /> Active
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)", fontStyle: "italic" }}>
                    No courses registered for this session yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Study Reader Modal */}
      {activeMaterial && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 37, 64, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "2rem",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    padding: "0.2rem 0.65rem",
                    borderRadius: "999px",
                    background: "#dcfce7",
                    color: "#166534",
                  }}
                >
                  {activeMaterial.category} • {activeMaterial.weekLabel}
                </span>
                <h2 style={{ color: "#0A2540", margin: "0.5rem 0 0.2rem 0", fontSize: "1.35rem" }}>
                  {activeMaterial.title}
                </h2>
                <div style={{ fontSize: "0.83rem", color: "#64748b" }}>
                  <strong>Subject:</strong> {activeMaterial.subjectName} &nbsp;•&nbsp;{" "}
                  <strong>Class:</strong> {activeMaterial.className} &nbsp;•&nbsp;{" "}
                  <strong>By:</strong> {activeMaterial.teacherEmail}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveMaterial(null)}
                className="btn btn-outline"
                style={{ padding: "0.35rem 0.75rem" }}
              >
                Close
              </button>
            </div>

            {activeMaterial.dueDate && (
              <div
                style={{
                  background: "#fef3c7",
                  border: "1px solid #fde68a",
                  color: "#92400e",
                  padding: "0.65rem 1rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  marginBottom: "1rem",
                }}
              >
                Submission / Completion Deadline: {activeMaterial.dueDate}
              </div>
            )}

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "1.25rem",
                whiteSpace: "pre-wrap",
                lineHeight: 1.7,
                color: "#1e293b",
                fontSize: "0.95rem",
              }}
            >
              {activeMaterial.content}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                type="button"
                onClick={() => handlePrintMaterial(activeMaterial)}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <FiPrinter /> Print / Save Study Sheet (PDF)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

