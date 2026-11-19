"use client";

import { useState } from "react";
import { enrollApplicantToStudent, rejectAdmissionApplication } from "@/app/actions/admin";
import { FiCheckCircle, FiXCircle, FiSearch, FiUserPlus, FiMail, FiPhone, FiCalendar, FiPrinter } from "react-icons/fi";

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
  const [lastNotificationLinks, setLastNotificationLinks] = useState<{
    whatsappUrl?: string | null;
    smsUrl?: string | null;
    recipientPhone?: string;
    recipientEmail?: string;
    wofsStudentId?: string;
    claimCode?: string;
    studentName?: string;
  } | null>(null);

  const handlePrintAdmissionSlip = (info: {
    studentName: string;
    wofsStudentId: string;
    claimCode: string;
  }) => {
    const win = window.open("", "_blank", "width=720,height=600");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Registration Slip — ${info.wofsStudentId}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #0f172a; }
            .slip { border: 2px solid #0A2540; border-radius: 12px; padding: 28px; max-width: 580px; margin: 0 auto; }
            .header { border-bottom: 3px double #15803d; padding-bottom: 12px; margin-bottom: 18px; text-align: center; }
            .box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 16px 0; }
            .code { font-family: monospace; font-size: 20px; font-weight: 900; color: #15803d; letter-spacing: 1.5px; }
          </style>
        </head>
        <body>
          <div class="slip">
            <div class="header">
              <h2 style="margin:0;color:#0A2540;">WORD OF FAITH SCHOOLS</h2>
              <p style="margin:4px 0 0;font-size:12px;color:#15803d;font-weight:700;">ADMISSION ENROLMENT &amp; PORTAL INVITATION SLIP</p>
            </div>
            <p><strong>Student Name:</strong> ${info.studentName}</p>
            <p><strong>Permanent WOFS Student ID:</strong> <code style="font-size:16px;font-weight:bold;">${info.wofsStudentId}</code></p>
            <div class="box">
              <div style="font-size:12px;font-weight:bold;color:#166534;">SINGLE-USE REGISTRATION INVITATION CODE</div>
              <div class="code">${info.claimCode}</div>
              <div style="font-size:12px;color:#475569;margin-top:6px;">Visit <strong>/portal/register</strong> to claim the student portal account.</div>
            </div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

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

    // Leave customAdmissionNo blank by default so backend automatically generates WOFS-STU-YYYY-NNNNNN
    setCustomAdmissionNo("");

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
      const claimNotice = (res as any).claimCode
        ? ` | Single-Use Invitation Code: ${(res as any).claimCode}`
        : "";
      const emailStatus = (res as any).emailSent
        ? ` | Confirmation email sent to ${(res as any).recipientEmail}`
        : ` | Notification prepared for ${(res as any).recipientEmail}`;
      setSuccess(`Student ${selectedApp.childFirstName} ${selectedApp.childLastName} enrolled with Permanent WOFS ID: ${res.admissionNo}${claimNotice}${emailStatus}`);
      setLastNotificationLinks({
        whatsappUrl: (res as any).whatsappUrl,
        smsUrl: (res as any).smsUrl,
        recipientPhone: (res as any).recipientPhone,
        recipientEmail: (res as any).recipientEmail,
        wofsStudentId: res.admissionNo,
        claimCode: (res as any).claimCode,
        studentName: `${selectedApp.childFirstName} ${selectedApp.childLastName}`,
      });
      setShowEnrollModal(false);
      setSelectedApp(null);
    } else {
      setError(res.error || "Failed to enroll student");
    }
    setLoading(false);
  };

  const handleReject = async (appId: number, name: string) => {
    const reason = prompt(`Optional note/reason to include in the rejection email/SMS for ${name} (or leave blank):`, "");
    if (reason === null) return;

    setLoading(true);
    setError("");
    setSuccess("");

    const res = await rejectAdmissionApplication(appId, reason || undefined);
    if (res.success) {
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: "Rejected" } : a));
      const emailStatus = (res as any).emailSent
        ? ` Confirmatory rejection email sent to ${(res as any).recipientEmail}.`
        : ` Notification prepared for ${(res as any).recipientEmail}.`;
      setSuccess(`Application for ${name} marked as rejected.${emailStatus}`);
      setLastNotificationLinks({
        whatsappUrl: (res as any).whatsappUrl,
        smsUrl: (res as any).smsUrl,
        recipientPhone: (res as any).recipientPhone,
        recipientEmail: (res as any).recipientEmail,
      });
    } else {
      setError(res.error || "Failed to reject application");
    }
    setLoading(false);
  };

  return (
    <div>
      {error && <div style={{ background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold" }}>{error}</div>}
      {success && (
        <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontWeight: "bold", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div>{success}</div>
          {lastNotificationLinks && (lastNotificationLinks.whatsappUrl || lastNotificationLinks.smsUrl) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center", fontSize: "0.85rem" }}>
              <span style={{ color: "var(--status-success-text)" }}>
                Also notify applicant phone ({lastNotificationLinks.recipientPhone}):
              </span>
              {lastNotificationLinks.whatsappUrl && (
                <a
                  href={lastNotificationLinks.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: "var(--brand-primary)", color: "var(--brand-primary-text)", padding: "0.35rem 0.75rem", borderRadius: "6px", textDecoration: "none", fontWeight: 700 }}
                >
                  Send via WhatsApp
                </a>
              )}
              {lastNotificationLinks.smsUrl && (
                <a
                  href={lastNotificationLinks.smsUrl}
                  style={{ background: "var(--bg-card)", color: "var(--status-success-text)", border: "1px solid var(--status-success-border)", padding: "0.35rem 0.75rem", borderRadius: "6px", textDecoration: "none", fontWeight: 700 }}
                >
                  Send via SMS
                </a>
              )}
              {lastNotificationLinks.wofsStudentId && lastNotificationLinks.claimCode && (
                <button
                  type="button"
                  onClick={() =>
                    handlePrintAdmissionSlip({
                      studentName: lastNotificationLinks.studentName || "New Student",
                      wofsStudentId: lastNotificationLinks.wofsStudentId!,
                      claimCode: lastNotificationLinks.claimCode!,
                    })
                  }
                  style={{ background: "var(--bg-card)", color: "var(--text-heading)", border: "1px solid var(--border-primary)", padding: "0.35rem 0.75rem", borderRadius: "6px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <FiPrinter size={13} /> Print Invitation Slip
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "min(100%, 280px)", maxWidth: "600px", flexWrap: "wrap" }}>
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
                      background: app.status === "Approved" ? "var(--status-success-bg)" : app.status === "Pending" ? "var(--status-warning-bg)" : "var(--status-error-bg)",
                      color: app.status === "Approved" ? "var(--status-success-text)" : app.status === "Pending" ? "var(--status-warning-text)" : "var(--status-error-text)"
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
                          style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "var(--status-error-bg)", color: "var(--status-error-text)", border: "1px solid var(--status-error-border)" }}
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
        <div className="portal-modal-overlay">
          <div className="modal-content portal-modal-card" style={{ maxWidth: "520px" }}>
            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>
              Enroll Student & Assign Class Arm
            </h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Enrolling <strong>{selectedApp.childFirstName} {selectedApp.childLastName}</strong> into Word of Faith Schools.
            </p>

            <form onSubmit={handleEnroll}>
              <div className="form-group">
                <label className="form-label">Permanent WOFS Student ID (Auto-Generated)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={`Leave blank to auto-generate (e.g. WOFS-STU-${new Date().getFullYear()}-XXXXXX)`}
                  value={customAdmissionNo}
                  onChange={(e) => setCustomAdmissionNo(e.target.value)}
                />
                <small style={{ color: "var(--color-gray-500)", marginTop: "0.25rem", display: "block" }}>
                  Leave blank so the system transactionally mints a permanent <strong>WOFS-STU-{new Date().getFullYear()}-XXXXXX</strong> ID and single-use invitation code.
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "1rem" }}>
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
