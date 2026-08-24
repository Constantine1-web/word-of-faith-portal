"use client";

import { useState } from "react";
import { enrollApplicantToStudent, rejectAdmissionApplication } from "@/app/actions/admin";
import { FiCheckCircle, FiXCircle, FiSearch, FiUserPlus, FiMail, FiPhone, FiCalendar } from "react-icons/fi";

export default function AdmissionsReviewClient({
  initialApplications,
  classes
}: {
  initialApplications: any[];
  classes: any[];
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Enrollment Modal
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [targetClassId, setTargetClassId] = useState<string>(classes[0]?.ClassID?.toString() || "");
  const [customAdmissionNo, setCustomAdmissionNo] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [parentEmail, setParentEmail] = useState("");

  const filteredApps = applications.filter(app => {
    const fullName = `${app.childFirstName} ${app.childLastName}`.toLowerCase();
    const parent = app.parentName?.toLowerCase() || "";
    const email = app.parentEmail?.toLowerCase() || "";
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || parent.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openEnrollModal = (app: any) => {
    setSelectedApp(app);
    setParentContact(app.parentPhone || "");
    setParentEmail(app.parentEmail || "");
    
    // Suggest default class arm based on applyingClass string
    const matchingClass = classes.find(c => c.ClassName.toLowerCase().includes(app.applyingClass?.toLowerCase())) || classes[0];
    if (matchingClass) {
      setTargetClassId(matchingClass.ClassID.toString());
    }

    // Auto-generate suggested registration number
    const year = new Date().getFullYear();
    const isPry = app.applyingClass?.toLowerCase().includes("primary") || app.applyingClass?.toLowerCase().includes("basic") || app.applyingClass?.toLowerCase().includes("nursery");
    const prefix = isPry ? "PRY" : "SEC";
    const seq = Math.floor(Math.random() * 900 + 100).toString();
    setCustomAdmissionNo(`WOFS/${year}/${prefix}/${seq}`);

    setShowEnrollModal(true);
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await enrollApplicantToStudent({
      applicationId: selectedApp.id,
      classId: parseInt(targetClassId),
      admissionNo: customAdmissionNo,
      parentContact,
      parentEmail
    });

    if (res.success) {
      setApplications(prev => prev.map(a => a.id === selectedApp.id ? { ...a, status: "Approved" } : a));
      setSuccess(`Student ${selectedApp.childFirstName} ${selectedApp.childLastName} enrolled successfully with Reg No: ${res.admissionNo}!`);
      setShowEnrollModal(false);
      setSelectedApp(null);
    } else {
      setError(res.error || "Failed to enroll student");
    }
    setLoading(false);
  };

  const handleReject = async (appId: number, name: string) => {
    if (!confirm(`Reject admission application for ${name}?`)) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await rejectAdmissionApplication(appId);
    if (res.success) {
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: "Rejected" } : a));
      setSuccess(`Application for ${name} marked as rejected.`);
    } else {
      setError(res.error || "Failed to reject application");
    }
    setLoading(false);
  };

  return (
    <div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && <div style={{ background: "#dcfce7", color: "#15803d", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{success}</div>}

      {/* Filter Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "280px", maxWidth: "600px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <FiSearch style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-gray-400)" }} />
            <input
              type="text"
              placeholder="Search child name, parent name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-input"
            style={{ width: "auto", minWidth: "140px" }}
          >
            <option value="ALL">All Status</option>
            <option value="Pending">Pending Review</option>
            <option value="Approved">Approved / Enrolled</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <div style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-gray-200)", overflowX: "auto", boxShadow: "var(--shadow-sm)" }}>
        <table className="responsive-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
              <th style={{ padding: "1rem", textAlign: "left" }}>Child Details</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Applied Class</th>
              <th style={{ padding: "1rem", textAlign: "left" }}>Parent / Guardian Contact</th>
              <th style={{ padding: "1rem", textAlign: "center" }}>Status</th>
              <th style={{ padding: "1rem", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredApps.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: "var(--color-gray-500)" }}>
                  No admission applications found.
                </td>
              </tr>
            ) : (
              filteredApps.map((app) => (
                <tr key={app.id} style={{ borderBottom: "1px solid var(--color-gray-200)" }}>
                  <td data-label="Child Details" style={{ padding: "1rem" }}>
                    <div style={{ fontWeight: "bold", color: "var(--color-navy-blue)", fontSize: "1rem" }}>
                      {app.childFirstName} {app.childLastName}
                    </div>
                    <div style={{ color: "var(--color-gray-500)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      {app.gender} · Born {new Date(app.dateOfBirth).toLocaleDateString()}
                    </div>
                    {app.previousSchool && (
                      <div style={{ color: "var(--color-gray-400)", fontSize: "0.8rem" }}>
                        Prev: {app.previousSchool}
                      </div>
                    )}
                  </td>

                  <td data-label="Applied Class" style={{ padding: "1rem", fontWeight: "600", color: "var(--color-primary-green)" }}>
                    {app.applyingClass}
                  </td>

                  <td data-label="Parent Contact" style={{ padding: "1rem", fontSize: "0.9rem" }}>
                    <div style={{ fontWeight: "600", color: "var(--color-gray-800)" }}>{app.parentName}</div>
                    <div style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <FiPhone size={12} /> {app.parentPhone}
                    </div>
                    <div style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <FiMail size={12} /> {app.parentEmail}
                    </div>
                  </td>

                  <td data-label="Status" style={{ padding: "1rem", textAlign: "center" }}>
                    <span style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      background: app.status === "Approved" ? "#dcfce7" : app.status === "Pending" ? "#fef3c7" : "#fee2e2",
                      color: app.status === "Approved" ? "#15803d" : app.status === "Pending" ? "#b45309" : "#b91c1c"
                    }}>
                      {app.status}
                    </span>
                  </td>

                  <td data-label="Actions" style={{ padding: "1rem", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                      {app.status !== "Approved" && (
                        <button
                          onClick={() => openEnrollModal(app)}
                          disabled={loading}
                          className="btn btn-primary"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
                        >
                          <FiUserPlus /> Enroll Student
                        </button>
                      )}
                      {app.status !== "Rejected" && app.status !== "Approved" && (
                        <button
                          onClick={() => handleReject(app.id, `${app.childFirstName} ${app.childLastName}`)}
                          disabled={loading}
                          className="btn"
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "#fee2e2", color: "#b91c1c", border: "none" }}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Enrollment Modal */}
      {showEnrollModal && selectedApp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="modal-content" style={{ background: "var(--color-white)", borderRadius: "var(--radius-lg)", padding: "2rem", width: "100%", maxWidth: "520px", boxShadow: "var(--shadow-floating)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
              Enroll Student & Assign Class Arm
            </h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Enrolling <strong>{selectedApp.childFirstName} {selectedApp.childLastName}</strong> into Word of Faith Schools.
            </p>

            <form onSubmit={handleEnroll}>
              <div className="form-group">
                <label className="form-label">Auto-Generated Registration Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={customAdmissionNo}
                  onChange={(e) => setCustomAdmissionNo(e.target.value)}
                  required
                />
                <small style={{ color: "var(--color-gray-500)", marginTop: "0.25rem", display: "block" }}>
                  Students and parents use this number to claim portal accounts and check terminal results.
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Assign Class Arm</label>
                <select
                  className="form-input"
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(e.target.value)}
                  required
                >
                  {classes.map(c => (
                    <option key={c.ClassID} value={c.ClassID.toString()}>
                      {c.ClassName} ({c.Level}) {c.FormMaster ? `· Form Master: ${c.FormMaster.Email}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Parent Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    value={parentContact}
                    onChange={(e) => setParentContact(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Parent Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1.5rem" }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowEnrollModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Enrolling..." : "Confirm & Enroll"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
