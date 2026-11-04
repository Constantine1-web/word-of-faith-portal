"use client";

import { useState } from "react";
import PortalShell from "@/components/portal/PortalShell";
import AdminNav from "@/components/portal/AdminNav";
import TeacherNav from "@/components/portal/TeacherNav";
import Sidebar from "@/components/dashboard/Sidebar";
import styles from "@/components/dashboard/DashboardLayout.module.css";
import { FiSearch, FiUserPlus } from "react-icons/fi";

export default function PreviewResponsivePage() {
  const [activeTab, setActiveTab] = useState<"admin" | "teacher" | "student">("admin");

  return (
    <div style={{ background: "var(--color-gray-50)", minHeight: "100vh" }}>
      {/* View Switcher Banner */}
      <div style={{
        background: "#07192C",
        color: "white",
        padding: "0.75rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.5rem",
        borderBottom: "1px solid rgba(255,255,255,0.15)"
      }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>
          Responsive Portal Shell Preview
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => setActiveTab("admin")}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "4px",
              background: activeTab === "admin" ? "#4ade80" : "rgba(255,255,255,0.1)",
              color: activeTab === "admin" ? "#0A2540" : "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.8rem"
            }}
          >
            Admin View
          </button>
          <button
            onClick={() => setActiveTab("teacher")}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "4px",
              background: activeTab === "teacher" ? "#38bdf8" : "rgba(255,255,255,0.1)",
              color: activeTab === "teacher" ? "#0A2540" : "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.8rem"
            }}
          >
            Teacher View
          </button>
          <button
            onClick={() => setActiveTab("student")}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "4px",
              background: activeTab === "student" ? "#f43f5e" : "rgba(255,255,255,0.1)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.8rem"
            }}
          >
            Student View
          </button>
        </div>
      </div>

      {activeTab === "admin" && (
        <PortalShell
          title="Admin Control Center"
          sidebarBackground="linear-gradient(180deg, #0A2540 0%, #07192C 100%)"
          sidebarWidth="270px"
          sidebar={
            <AdminNav
              email="bursar@wordoffaith.edu.ng"
              roles={["ADMIN", "SUPER_ADMIN", "PRINCIPAL", "BURSAR", "ADMISSIONS"]}
            />
          }
        >
          <div>
            <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
              Examinations, Broadsheets & Results
            </h1>
            <p style={{ color: "var(--color-gray-600)", marginBottom: "1.5rem" }}>
              Review student performance metrics and master broadsheets.
            </p>

            {/* Filter Bar with Search and Select */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
              flexWrap: "wrap",
              gap: "1rem"
            }}>
              <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "min(100%, 280px)", maxWidth: "600px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: "min(100%, 200px)" }}>
                  <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-400)" }} />
                  <input
                    type="text"
                    placeholder="Search students..."
                    className="form-input"
                    style={{ paddingLeft: "2.5rem" }}
                  />
                </div>
                <select className="form-input" style={{ width: "auto", minWidth: "140px" }}>
                  <option>All Classes</option>
                  <option>SS3 Alpha</option>
                  <option>JSS1 Gold</option>
                </select>
              </div>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FiUserPlus /> Export Broadsheet
              </button>
            </div>

            {/* Wide Table with Scroll Container */}
            <div style={{
              background: "var(--color-white)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-gray-200)",
              overflowX: "auto",
              boxShadow: "var(--shadow-sm)"
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                <thead>
                  <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                    <th style={{ padding: "1rem", textAlign: "left" }}>Reg No</th>
                    <th style={{ padding: "1rem", textAlign: "left" }}>Full Name</th>
                    <th style={{ padding: "1rem", textAlign: "center" }}>CA Score</th>
                    <th style={{ padding: "1rem", textAlign: "center" }}>Exam Score</th>
                    <th style={{ padding: "1rem", textAlign: "center" }}>Total</th>
                    <th style={{ padding: "1rem", textAlign: "center" }}>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                      <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>WOF/2026/00{i}</td>
                      <td style={{ padding: "1rem", fontWeight: 600 }}>Student Sample #{i}</td>
                      <td style={{ padding: "1rem", textAlign: "center" }}>35</td>
                      <td style={{ padding: "1rem", textAlign: "center" }}>54</td>
                      <td style={{ padding: "1rem", textAlign: "center", fontWeight: "bold" }}>89</td>
                      <td style={{ padding: "1rem", textAlign: "center", color: "#166534", fontWeight: "bold" }}>A</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </PortalShell>
      )}

      {activeTab === "teacher" && (
        <PortalShell
          title="Educator Workspace"
          sidebarBackground="linear-gradient(180deg, #0A2540 0%, #0F3456 100%)"
          sidebarWidth="265px"
          sidebar={
            <TeacherNav
              email="teacher@wordoffaith.edu.ng"
              roles={["TEACHER", "FORM_MASTER"]}
              isAdminSupervisor={false}
            />
          }
        >
          <div>
            <h1 style={{ color: "var(--color-navy-blue)" }}>Educator Workspace</h1>
            <p style={{ color: "var(--color-gray-600)", marginBottom: "1.5rem" }}>
              Continuous assessment and grade entry.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "1rem" }}>
              <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <h3>SS2 Mathematics</h3>
                <p style={{ color: "var(--color-gray-500)" }}>38 Students Enrolled</p>
              </div>
              <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <h3>JSS3 Basic Science</h3>
                <p style={{ color: "var(--color-gray-500)" }}>42 Students Enrolled</p>
              </div>
            </div>
          </div>
        </PortalShell>
      )}

      {activeTab === "student" && (
        <div className={styles.layoutContainer}>
          <Sidebar />
          <main className={styles.mainContent} style={{ padding: "1.5rem" }}>
            <h1 style={{ color: "white" }}>Student Dashboard</h1>
            <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "1.5rem" }}>
              Track academic progress and fee payments.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "1rem" }}>
              <div style={{ background: "rgba(255,255,255,0.1)", color: "white", padding: "1.5rem", borderRadius: "8px" }}>
                <h3>First Term</h3>
                <p>Status: Registered</p>
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
