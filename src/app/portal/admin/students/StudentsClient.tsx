"use client";

import { useState } from "react";
import { addStudent, deleteStudent } from "@/app/actions/admin";
import { lookupStudentByEmail, sendDirectStudentMessage } from "@/app/actions/messaging";
import {
  FiTrash2,
  FiPlus,
  FiMail,
  FiPhone,
  FiMessageSquare,
  FiSearch,
  FiSend,
  FiCheckCircle,
  FiExternalLink,
  FiX,
} from "react-icons/fi";

export default function StudentsClient({
  initialStudents,
  classes,
}: {
  initialStudents: any[];
  classes: any[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    parentContact: "",
    admissionNo: "",
    classId: classes.length > 0 ? classes[0].ClassID : 1,
  });

  // Direct Student Messaging Modal State
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [studentEmailInput, setStudentEmailInput] = useState("");
  const [resolvedStudent, setResolvedStudent] = useState<{
    studentId?: number;
    studentName: string;
    admissionNo: string;
    className: string;
    registrationEmail: string;
    studentPhone: string;
  } | null>(null);
  const [phoneOverride, setPhoneOverride] = useState("");
  const [msgSubject, setMsgSubject] = useState("Official Notice from Word of Faith Schools");
  const [msgBody, setMsgBody] = useState("");
  const [channels, setChannels] = useState<("EMAIL" | "WHATSAPP" | "SMS")[]>([
    "EMAIL",
    "WHATSAPP",
    "SMS",
  ]);
  const [dispatching, setDispatching] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<{
    type: "success" | "error";
    text: string;
    whatsappUrl?: string | null;
    smsUrl?: string | null;
    emailSent?: boolean;
  } | null>(null);

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const name = (s.PreferredName || `${s.FirstName || ""} ${s.LastName || ""}`).toLowerCase();
    const adm = (s.AdmissionNo || "").toLowerCase();
    const regEmail = (s.User?.Email || s.ParentEmail || "").toLowerCase();
    const phone = (s.ParentContact || "").toLowerCase();
    return name.includes(q) || adm.includes(q) || regEmail.includes(q) || phone.includes(q);
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await addStudent(formData);
    setLoading(false);
    if (res.success) {
      alert("Student added successfully");
      window.location.reload();
    } else {
      alert(res.error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this student?")) return;
    const res = await deleteStudent(id);
    if (res.success) {
      setStudents(students.filter((s) => s.StudentID !== id));
    } else {
      alert(res.error);
    }
  };

  const openDirectMessageForStudent = (student?: any) => {
    setDispatchFeedback(null);
    if (student) {
      const regEmail = student.User?.Email || student.ParentEmail || "";
      const phone = student.ParentContact && student.ParentContact !== "08000000000" ? student.ParentContact : "";
      const name =
        student.PreferredName ||
        `${student.FirstName || ""} ${student.LastName || ""}`.trim() ||
        student.AdmissionNo;

      setStudentEmailInput(regEmail || student.AdmissionNo);
      setResolvedStudent({
        studentId: student.StudentID,
        studentName: name,
        admissionNo: student.AdmissionNo,
        className: student.Class?.ClassName || "General",
        registrationEmail: regEmail,
        studentPhone: phone,
      });
      setPhoneOverride(phone);
    } else {
      setStudentEmailInput("");
      setResolvedStudent(null);
      setPhoneOverride("");
    }
    setShowMessageModal(true);
  };

  const handleLookupByEmail = async () => {
    if (!studentEmailInput.trim()) return;
    setLookingUp(true);
    setDispatchFeedback(null);
    const res = await lookupStudentByEmail(studentEmailInput.trim());
    setLookingUp(false);
    if (res.success && res.student) {
      setResolvedStudent(res.student);
      setPhoneOverride(
        res.student.studentPhone && res.student.studentPhone !== "08000000000"
          ? res.student.studentPhone
          : ""
      );
    } else {
      setResolvedStudent(null);
      setDispatchFeedback({
        type: "error",
        text: res.error || "Student not found by that email or registration number.",
      });
    }
  };

  const toggleChannel = (ch: "EMAIL" | "WHATSAPP" | "SMS") => {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetIdentifier = resolvedStudent?.studentId || studentEmailInput.trim();
    if (!targetIdentifier) {
      setDispatchFeedback({
        type: "error",
        text: "Please enter a student registration email or select a student.",
      });
      return;
    }
    if (channels.length === 0) {
      setDispatchFeedback({
        type: "error",
        text: "Please select at least one delivery channel (Email, WhatsApp, or SMS).",
      });
      return;
    }

    setDispatching(true);
    setDispatchFeedback(null);

    const res = await sendDirectStudentMessage({
      studentIdentifier: targetIdentifier,
      subject: msgSubject,
      message: msgBody,
      channels,
      phoneOverride: phoneOverride.trim() || undefined,
    });

    setDispatching(false);

    if (res.success) {
      // Update local state phone number if updated
      if (phoneOverride.trim() && resolvedStudent?.studentId) {
        setStudents((prev) =>
          prev.map((s) =>
            s.StudentID === resolvedStudent.studentId
              ? { ...s, ParentContact: phoneOverride.trim() }
              : s
          )
        );
      }

      const statusParts: string[] = [];
      if (channels.includes("EMAIL")) {
        statusParts.push(
          res.emailSent
            ? `Email sent to ${res.registrationEmail}`
            : `Email queued for ${res.registrationEmail}`
        );
      }
      if (channels.includes("WHATSAPP")) {
        statusParts.push(
          res.whatsappApiDispatched
            ? `WhatsApp dispatched to ${res.studentPhone}`
            : `WhatsApp ready for ${res.studentPhone || "phone"}`
        );
      }
      if (channels.includes("SMS")) {
        statusParts.push(
          res.smsApiDispatched
            ? `SMS dispatched to ${res.studentPhone}`
            : `SMS ready for ${res.studentPhone || "phone"}`
        );
      }

      setDispatchFeedback({
        type: "success",
        text: `Direct message processed for ${res.studentName} (${res.admissionNo}): ${statusParts.join(" | ")}`,
        whatsappUrl: res.whatsappUrl,
        smsUrl: res.smsUrl,
        emailSent: res.emailSent,
      });
    } else {
      setDispatchFeedback({
        type: "error",
        text: res.error || "Failed to send direct message.",
      });
    }
  };

  return (
    <div>
      {/* Action Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "440px" }}>
          <FiSearch
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-gray-500)",
            }}
          />
          <input
            type="text"
            placeholder="Search by student email, name, phone, or admission no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.65rem 0.75rem 0.65rem 2.25rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-gray-300)",
              background: "white",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => openDirectMessageForStudent()}
            className="btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#0A2540",
              color: "white",
              border: "none",
              padding: "0.65rem 1.1rem",
              borderRadius: "var(--radius-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <FiSend /> Message Student by Email / WhatsApp / SMS
          </button>

          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <FiPlus /> Add Student
          </button>
        </div>
      </div>

      {/* Add Student Form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          style={{
            background: "white",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "2rem",
            display: "grid",
            gap: "1rem",
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--color-gray-200)",
          }}
        >
          <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Enroll New Student Profile</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
              gap: "1rem",
            }}
          >
            <input
              type="text"
              placeholder="First Name *"
              required
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              style={{ padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}
            />
            <input
              type="text"
              placeholder="Last Name *"
              required
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              style={{ padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}
            />
            <input
              type="email"
              placeholder="Portal Registration Email *"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{ padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}
            />
            <input
              type="tel"
              placeholder="WhatsApp / SMS Phone (e.g. 0803...)"
              value={formData.parentContact}
              onChange={(e) => setFormData({ ...formData, parentContact: e.target.value })}
              style={{ padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}
            />
            <input
              type="text"
              placeholder="Admission No (e.g. WOF/2026/001) *"
              required
              value={formData.admissionNo}
              onChange={(e) => setFormData({ ...formData, admissionNo: e.target.value })}
              style={{ padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}
            />
            <select
              value={formData.classId}
              onChange={(e) => setFormData({ ...formData, classId: parseInt(e.target.value) })}
              style={{ padding: "0.65rem", borderRadius: "var(--radius-sm)", border: "1px solid #ddd" }}
            >
              {classes.map((c) => (
                <option key={c.ClassID} value={c.ClassID}>
                  {c.ClassName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Saving..." : "Save Student Profile"}
          </button>
        </form>
      )}

      {/* Students Table */}
      <div
        style={{
          overflowX: "auto",
          background: "white",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-100)", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Student Name</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Admission No</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Class</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>Registration Email</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "left" }}>WhatsApp / SMS Phone</th>
              <th style={{ padding: "0.9rem 1rem", textAlign: "right" }}>Direct Dispatch & Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((s) => {
              const regEmail = s.User?.Email || s.ParentEmail || "Unclaimed";
              const phone =
                s.ParentContact && s.ParentContact !== "08000000000"
                  ? s.ParentContact
                  : "Not set";
              const cleanDigits = (s.ParentContact || "").replace(/\D/g, "");
              const formattedWa =
                cleanDigits.startsWith("0") && cleanDigits.length === 11
                  ? `234${cleanDigits.slice(1)}`
                  : cleanDigits;

              return (
                <tr key={s.StudentID} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.9rem 1rem", fontWeight: 600, color: "var(--color-navy-blue)" }}>
                    {s.PreferredName || `${s.FirstName || ""} ${s.LastName || ""}`.trim() || s.AdmissionNo}
                  </td>
                  <td style={{ padding: "0.9rem 1rem", fontFamily: "monospace", fontSize: "0.9rem" }}>
                    {s.AdmissionNo}
                  </td>
                  <td style={{ padding: "0.9rem 1rem" }}>{s.Class?.ClassName || "Unassigned"}</td>
                  <td style={{ padding: "0.9rem 1rem", fontSize: "0.9rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <FiMail size={14} color="var(--color-primary-green)" />
                      {regEmail}
                    </span>
                  </td>
                  <td style={{ padding: "0.9rem 1rem", fontSize: "0.9rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <FiPhone size={14} color="#0284c7" />
                      {phone}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.9rem 1rem",
                      textAlign: "right",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "0.5rem",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openDirectMessageForStudent(s)}
                      title="Send Direct Email, WhatsApp, or SMS using Student Email"
                      style={{
                        background: "#ecfdf5",
                        color: "#065f46",
                        border: "1px solid #a7f3d0",
                        borderRadius: "6px",
                        padding: "0.4rem 0.7rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <FiMessageSquare size={14} /> Message
                    </button>

                    {formattedWa && formattedWa !== "2348000000000" && (
                      <a
                        href={`https://wa.me/${formattedWa}?text=${encodeURIComponent(
                          `Hello ${s.PreferredName || s.AdmissionNo}, this is an official message from Word of Faith Schools.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Direct WhatsApp to ${phone}`}
                        style={{
                          background: "#25D366",
                          color: "white",
                          borderRadius: "6px",
                          padding: "0.4rem 0.65rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        WA <FiExternalLink size={12} />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDelete(s.StudentID)}
                      title="Delete Student"
                      style={{
                        color: "#dc2626",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: "6px",
                        cursor: "pointer",
                        padding: "0.4rem 0.55rem",
                      }}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Direct Student Email / WhatsApp / SMS Dispatch Modal */}
      {showMessageModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 37, 64, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "var(--radius-lg)",
              width: "100%",
              maxWidth: "580px",
              maxHeight: "92vh",
              overflowY: "auto",
              padding: "1.75rem",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                borderBottom: "1px solid var(--color-gray-200)",
                paddingBottom: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "var(--color-navy-blue)", fontSize: "1.2rem" }}>
                  Direct Student Dispatch (Email • WhatsApp • SMS)
                </h3>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--color-gray-600)" }}>
                  Resolve any student by their registered portal email to send direct Email, WhatsApp (via phone), or SMS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMessageModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-gray-500)" }}
              >
                <FiX size={22} />
              </button>
            </div>

            <form onSubmit={handleSendDirectMessage} style={{ display: "grid", gap: "1rem" }}>
              {/* Step 1: Student Email Lookup */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--color-navy-blue)" }}>
                  Student Portal Registration Email (or Admission No) *
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    required
                    placeholder="e.g. student1@wordoffaith.edu.ng or WOF/2026/001"
                    value={studentEmailInput}
                    onChange={(e) => setStudentEmailInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "0.65rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-gray-300)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleLookupByEmail}
                    disabled={lookingUp}
                    style={{
                      background: "var(--color-navy-blue)",
                      color: "white",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "0 1rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {lookingUp ? "Resolving..." : "Resolve Student"}
                  </button>
                </div>
              </div>

              {/* Resolved Student Summary Card */}
              {resolvedStudent && (
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.85rem 1rem",
                    fontSize: "0.85rem",
                    color: "#065f46",
                  }}
                >
                  <div>
                    <strong>Resolved Student:</strong> {resolvedStudent.studentName} ({resolvedStudent.admissionNo} — {resolvedStudent.className})
                  </div>
                  <div>
                    <strong>Registration Email (for Direct Email):</strong>{" "}
                    {resolvedStudent.registrationEmail || "Not yet registered"}
                  </div>
                </div>
              )}

              {/* Student Phone Number for Direct WhatsApp & SMS */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--color-navy-blue)" }}>
                  Student Phone Number (for Direct WhatsApp & SMS)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 08031234567 or +2348031234567"
                  value={phoneOverride}
                  onChange={(e) => setPhoneOverride(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-300)",
                  }}
                />
                <small style={{ color: "var(--color-gray-500)", fontSize: "0.78rem" }}>
                  Used for Direct WhatsApp and Direct SMS. Updating this number automatically saves it to the student&apos;s profile.
                </small>
              </div>

              {/* Delivery Channels */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem", color: "var(--color-navy-blue)" }}>
                  Select Delivery Channels *
                </label>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {(
                    [
                      { id: "EMAIL", label: "Direct Registration Email" },
                      { id: "WHATSAPP", label: "Direct WhatsApp (Phone)" },
                      { id: "SMS", label: "Direct SMS (Phone)" },
                    ] as const
                  ).map((ch) => {
                    const active = channels.includes(ch.id);
                    return (
                      <label
                        key={ch.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: "0.5rem 0.85rem",
                          borderRadius: "var(--radius-sm)",
                          border: active ? "2px solid var(--color-primary-green)" : "1px solid var(--color-gray-300)",
                          background: active ? "#ecfdf5" : "#f9fafb",
                          fontWeight: 600,
                          fontSize: "0.83rem",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleChannel(ch.id)}
                        />
                        {ch.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Subject & Message */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--color-navy-blue)" }}>
                  Subject / Heading
                </label>
                <input
                  type="text"
                  required
                  value={msgSubject}
                  onChange={(e) => setMsgSubject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-300)",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--color-navy-blue)" }}>
                  Message Content *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter message to dispatch to the student via Email, WhatsApp, and/or SMS..."
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-300)",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Feedback & Direct WhatsApp / SMS Launch Buttons */}
              {dispatchFeedback && (
                <div
                  style={{
                    padding: "0.9rem 1rem",
                    borderRadius: "var(--radius-sm)",
                    background: dispatchFeedback.type === "success" ? "#ecfdf5" : "#fef2f2",
                    border: `1px solid ${dispatchFeedback.type === "success" ? "#a7f3d0" : "#fecaca"}`,
                    color: dispatchFeedback.type === "success" ? "#065f46" : "#b91c1c",
                    fontSize: "0.86rem",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                    <FiCheckCircle style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
                    {dispatchFeedback.text}
                  </div>
                  {(dispatchFeedback.whatsappUrl || dispatchFeedback.smsUrl) && (
                    <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                      {dispatchFeedback.whatsappUrl && (
                        <a
                          href={dispatchFeedback.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: "#25D366",
                            color: "white",
                            padding: "0.45rem 0.85rem",
                            borderRadius: "6px",
                            textDecoration: "none",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                          }}
                        >
                          Launch Direct WhatsApp <FiExternalLink />
                        </a>
                      )}
                      {dispatchFeedback.smsUrl && (
                        <a
                          href={dispatchFeedback.smsUrl}
                          style={{
                            background: "#0284c7",
                            color: "white",
                            padding: "0.45rem 0.85rem",
                            borderRadius: "6px",
                            textDecoration: "none",
                            fontWeight: 700,
                            fontSize: "0.82rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                          }}
                        >
                          Launch Direct SMS <FiPhone />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  style={{
                    padding: "0.65rem 1.1rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-gray-300)",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={dispatching}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                >
                  <FiSend /> {dispatching ? "Dispatching..." : "Send Direct Message"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

