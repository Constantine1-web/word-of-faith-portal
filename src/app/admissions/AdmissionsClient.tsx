"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCheckCircle, FiChevronDown, FiChevronUp, FiSearch, FiArrowRight } from "react-icons/fi";
import {
  lookupPublicAdmissionStatus,
  type PublicAdmissionLookupResultItem,
  type PublicFeeScheduleItem,
} from "@/app/actions/admissionsPublic";
import { formatAdmissionReference } from "@/lib/admissions-lookup";

const FAQS = [
  {
    question: "What is the age requirement for Nursery?",
    answer:
      "Children must be at least 3 years old by September of the admission year to enter Nursery 1.",
  },
  {
    question: "Are the school fees paid per term or annually?",
    answer:
      "School fees are billed per term. However, parents have the option to make an annual payment at a discounted rate.",
  },
  {
    question: "Is there a boarding facility?",
    answer:
      "Yes, we offer premium boarding facilities for Secondary School students (JSS1 - SS3) with excellent pastoral care.",
  },
  {
    question: "What curriculum does the school run?",
    answer:
      "We run a blended curriculum. Nursery uses Montessori, while Primary and Secondary integrate the Nigerian National Curriculum with international standards.",
  },
];

function formatNaira(amount: number): string {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
}

export default function AdmissionsClient({
  initialSchedules,
}: {
  initialSchedules: PublicFeeScheduleItem[];
}) {
  const [panelMode, setPanelMode] = useState<"apply" | "status">("apply");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState<{ id?: number } | null>(null);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    childFirstName: "",
    childLastName: "",
    dateOfBirth: "",
    gender: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    applyingClass: "",
    previousSchool: "",
  });

  // Self-service status lookup state
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupDob, setLookupDob] = useState("");
  const [lookupRef, setLookupRef] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResults, setLookupResults] = useState<PublicAdmissionLookupResultItem[]>([]);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleNext = () => setStep((prev) => prev + 1);
  const handlePrev = () => setStep((prev) => prev - 1);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok) {
        setSubmittedApplication(data.application || null);
        setSuccess(true);
      } else {
        setError(data.error || "Submission failed.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupLoading(true);
    setLookupError("");
    setLookupResults([]);

    const res = await lookupPublicAdmissionStatus({
      parentEmail: lookupEmail,
      dateOfBirth: lookupDob,
      applicationRef: lookupRef.trim() || undefined,
    });

    if (res.success) {
      setLookupResults(res.applications);
    } else {
      setLookupError(res.error || "Unable to verify application details.");
    }
    setLookupLoading(false);
  };

  return (
    <div>
      {/* Hero */}
      <section
        style={{
          position: "relative",
          background:
            "url('https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=1600&auto=format&fit=crop') center/cover",
          padding: "8rem 1rem 6rem",
          color: "white",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "linear-gradient(rgba(10,37,64,0.85), rgba(10,37,64,0.95))",
          }}
        />
        <div className="container" style={{ position: "relative", zIndex: 1, maxWidth: "800px" }}>
          <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 3.5rem)", marginBottom: "1rem", color: "white" }}>
            Online Admissions
          </h1>
          <p style={{ fontSize: "clamp(1rem, 3vw, 1.2rem)", color: "rgba(255, 255, 255, 0.9)" }}>
            Begin your child&apos;s journey to excellence, review current term fees, or track an existing application.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="container" style={{ padding: "clamp(2.5rem, 6vw, 5rem) 1rem" }}>
        <div className="responsive-grid" style={{ gap: "clamp(1.5rem, 4vw, 3.5rem)", alignItems: "start" }}>
          {/* Left Card: New Application OR Status Lookup */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-primary)",
              padding: "clamp(1.25rem, 3.5vw, 2.5rem)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Clean Tab Header */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border-primary)",
                marginBottom: "1.75rem",
                gap: "1.5rem",
              }}
            >
              <button
                type="button"
                onClick={() => setPanelMode("apply")}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.65rem 0.25rem",
                  fontWeight: 700,
                  fontSize: "0.98rem",
                  color: panelMode === "apply" ? "var(--color-navy-blue)" : "var(--text-muted)",
                  borderBottom:
                    panelMode === "apply"
                      ? "2px solid var(--color-primary-green)"
                      : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                New Application
              </button>
              <button
                type="button"
                onClick={() => setPanelMode("status")}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.65rem 0.25rem",
                  fontWeight: 700,
                  fontSize: "0.98rem",
                  color: panelMode === "status" ? "var(--color-navy-blue)" : "var(--text-muted)",
                  borderBottom:
                    panelMode === "status"
                      ? "2px solid var(--color-primary-green)"
                      : "2px solid transparent",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <FiSearch size={15} /> Check Application Status
              </button>
            </div>

            {panelMode === "apply" ? (
              <>
                <h2
                  style={{
                    color: "var(--color-navy-blue)",
                    fontSize: "clamp(1.35rem, 3.5vw, 1.75rem)",
                    marginBottom: "1.5rem",
                  }}
                >
                  Admission Application
                </h2>

                {success ? (
                  <div style={{ textAlign: "center", padding: "1.5rem 0.5rem" }}>
                    <FiCheckCircle
                      style={{
                        color: "var(--color-primary-green)",
                        fontSize: "3.75rem",
                        margin: "0 auto 1rem",
                      }}
                    />
                    <h3
                      style={{
                        color: "var(--color-navy-blue)",
                        fontSize: "1.5rem",
                        marginBottom: "0.65rem",
                      }}
                    >
                      Application Submitted
                    </h3>
                    {submittedApplication?.id && (
                      <div
                        style={{
                          display: "inline-block",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-primary)",
                          borderRadius: "6px",
                          padding: "0.45rem 0.9rem",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: "var(--text-heading)",
                          marginBottom: "1rem",
                        }}
                      >
                        Reference: {formatAdmissionReference(submittedApplication.id)}
                      </div>
                    )}
                    <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                      Thank you, <strong>{formData.parentName}</strong>. Your application for{" "}
                      <strong>
                        {formData.childFirstName} {formData.childLastName}
                      </strong>{" "}
                      (<strong>{formData.applyingClass}</strong>) is now queued for review. Keep your reference number to track decisions here or watch{" "}
                      <strong>{formData.parentEmail}</strong>.
                    </p>
                    <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => window.print()}
                      >
                        Print Slip
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => window.location.reload()}
                      >
                        Submit Another
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={
                      step === 3
                        ? handleSubmit
                        : (e) => {
                            e.preventDefault();
                            handleNext();
                          }
                    }
                  >
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem" }}>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: "5px",
                            borderRadius: "3px",
                            background: step >= i ? "var(--color-primary-green)" : "var(--color-gray-200)",
                          }}
                        />
                      ))}
                    </div>

                    {error && (
                      <div
                        style={{
                          background: "var(--status-error-bg)",
                          color: "var(--status-error-text)",
                          border: "1px solid var(--status-error-border)",
                          padding: "0.9rem 1rem",
                          borderRadius: "var(--radius-sm)",
                          marginBottom: "1.25rem",
                          fontWeight: 600,
                        }}
                      >
                        {error}
                      </div>
                    )}

                    {step === 1 && (
                      <div>
                        <h3 style={{ marginBottom: "1.25rem", color: "var(--color-navy-blue)", fontSize: "1.1rem" }}>
                          Step 1 of 3 — Student Information
                        </h3>
                        <div className="form-group">
                          <label className="form-label">First Name</label>
                          <input
                            type="text"
                            name="childFirstName"
                            className="form-input"
                            value={formData.childFirstName}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Last Name</label>
                          <input
                            type="text"
                            name="childLastName"
                            className="form-input"
                            value={formData.childLastName}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Date of Birth</label>
                          <input
                            type="date"
                            name="dateOfBirth"
                            className="form-input"
                            value={formData.dateOfBirth}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gender</label>
                          <select
                            name="gender"
                            className="form-input"
                            value={formData.gender}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.75rem" }}>
                          <button type="submit" className="btn btn-primary">
                            Next Step
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 2 && (
                      <div>
                        <h3 style={{ marginBottom: "1.25rem", color: "var(--color-navy-blue)", fontSize: "1.1rem" }}>
                          Step 2 of 3 — Parent &amp; Academic Details
                        </h3>
                        <div className="form-group">
                          <label className="form-label">Parent/Guardian Name</label>
                          <input
                            type="text"
                            name="parentName"
                            className="form-input"
                            value={formData.parentName}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Parent Email</label>
                          <input
                            type="email"
                            name="parentEmail"
                            className="form-input"
                            value={formData.parentEmail}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Parent Phone Number</label>
                          <input
                            type="text"
                            name="parentPhone"
                            className="form-input"
                            value={formData.parentPhone}
                            onChange={handleChange}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Applying For Class</label>
                          <select
                            name="applyingClass"
                            className="form-input"
                            value={formData.applyingClass}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Select Class</option>
                            <optgroup label="Early Years">
                              <option value="Creche">Creche</option>
                              <option value="Pre-Nursery">Pre-Nursery</option>
                              <option value="Nursery 1">Nursery 1</option>
                              <option value="Nursery 2">Nursery 2</option>
                            </optgroup>
                            <optgroup label="Primary School">
                              <option value="Primary 1">Primary 1</option>
                              <option value="Primary 2">Primary 2</option>
                              <option value="Primary 3">Primary 3</option>
                              <option value="Primary 4">Primary 4</option>
                              <option value="Primary 5">Primary 5</option>
                            </optgroup>
                            <optgroup label="Junior Secondary (JSS)">
                              <option value="JSS 1">JSS 1</option>
                              <option value="JSS 2">JSS 2</option>
                              <option value="JSS 3">JSS 3</option>
                            </optgroup>
                            <optgroup label="Senior Secondary (SSS)">
                              <option value="SS 1">SS 1</option>
                              <option value="SS 2">SS 2</option>
                            </optgroup>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Previous School (Optional)</label>
                          <input
                            type="text"
                            name="previousSchool"
                            className="form-input"
                            value={formData.previousSchool}
                            onChange={handleChange}
                          />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.75rem" }}>
                          <button type="button" className="btn btn-outline" onClick={handlePrev}>
                            Back
                          </button>
                          <button type="submit" className="btn btn-primary">
                            Next Step
                          </button>
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div>
                        <h3 style={{ marginBottom: "1.25rem", color: "var(--color-navy-blue)", fontSize: "1.1rem" }}>
                          Step 3 of 3 — Review &amp; Submit
                        </h3>
                        <div
                          style={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-primary)",
                            padding: "1.25rem",
                            borderRadius: "var(--radius-sm)",
                            marginBottom: "1.5rem",
                            lineHeight: 1.75,
                          }}
                        >
                          <div><strong>Student:</strong> {formData.childFirstName} {formData.childLastName}</div>
                          <div><strong>Applying For:</strong> {formData.applyingClass}</div>
                          <div><strong>Parent/Guardian:</strong> {formData.parentName}</div>
                          <div><strong>Email:</strong> {formData.parentEmail}</div>
                          <div><strong>Phone:</strong> {formData.parentPhone}</div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.75rem" }}>
                          <button type="button" className="btn btn-outline" onClick={handlePrev} disabled={loading}>
                            Back
                          </button>
                          <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? "Submitting..." : "Submit Application"}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                )}
              </>
            ) : (
              <div>
                <h2
                  style={{
                    color: "var(--color-navy-blue)",
                    fontSize: "clamp(1.35rem, 3.5vw, 1.75rem)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Track Application Status
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", marginBottom: "1.5rem" }}>
                  Enter the guardian email and child&apos;s date of birth used during registration to check review progress or retrieve enrollment details.
                </p>

                <form onSubmit={handleLookup} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Parent / Guardian Email *</label>
                    <input
                      type="email"
                      className="form-input"
                      value={lookupEmail}
                      onChange={(e) => setLookupEmail(e.target.value)}
                      placeholder="guardian@example.com"
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Child Date of Birth *</label>
                      <input
                        type="date"
                        className="form-input"
                        value={lookupDob}
                        onChange={(e) => setLookupDob(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Reference (Optional)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={lookupRef}
                        onChange={(e) => setLookupRef(e.target.value)}
                        placeholder="WOF-ADM-00012"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={lookupLoading}
                    style={{ justifyContent: "center" }}
                  >
                    {lookupLoading ? "Checking Records..." : "Check Application Status"}
                  </button>
                </form>

                {lookupError && (
                  <div
                    style={{
                      marginTop: "1.25rem",
                      padding: "0.9rem 1rem",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--status-error-bg)",
                      color: "var(--status-error-text)",
                      border: "1px solid var(--status-error-border)",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                    }}
                  >
                    {lookupError}
                  </div>
                )}

                {lookupResults.length > 0 && (
                  <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                    {lookupResults.map((item) => (
                      <div
                        key={item.reference}
                        style={{
                          border: "1px solid var(--border-primary)",
                          borderRadius: "var(--radius-md)",
                          padding: "1.1rem 1.25rem",
                          background: "var(--bg-secondary)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.88rem", color: "var(--text-heading)" }}>
                            {item.reference}
                          </span>
                          <span
                            style={{
                              padding: "0.2rem 0.65rem",
                              borderRadius: "4px",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              border: "1px solid",
                              background:
                                item.status === "Approved"
                                  ? "var(--status-success-bg)"
                                  : item.status === "Rejected"
                                  ? "var(--status-error-bg)"
                                  : "var(--status-warning-bg)",
                              color:
                                item.status === "Approved"
                                  ? "var(--status-success-text)"
                                  : item.status === "Rejected"
                                  ? "var(--status-error-text)"
                                  : "var(--status-warning-text)",
                              borderColor:
                                item.status === "Approved"
                                  ? "var(--status-success-border)"
                                  : item.status === "Rejected"
                                  ? "var(--status-error-border)"
                                  : "var(--status-warning-border)",
                            }}
                          >
                            {item.status === "Pending" ? "Pending Review" : item.status}
                          </span>
                        </div>

                        <div style={{ fontWeight: 700, color: "var(--text-heading)", marginBottom: "0.25rem" }}>
                          {item.childName} — Applying for {item.applyingClass}
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                          Submitted on {new Date(item.submittedAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                        </div>

                        {item.wofsStudentId && (
                          <div
                            style={{
                              marginTop: "0.75rem",
                              paddingTop: "0.75rem",
                              borderTop: "1px solid var(--border-primary)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: "0.5rem",
                            }}
                          >
                            <div style={{ fontSize: "0.86rem" }}>
                              <strong>Student ID:</strong> <code>{item.wofsStudentId}</code>
                              {item.assignedClassName ? ` • ${item.assignedClassName}` : ""}
                            </div>
                            <Link
                              href={`/portal/register?wofsId=${encodeURIComponent(item.wofsStudentId)}`}
                              style={{
                                fontSize: "0.84rem",
                                fontWeight: 700,
                                color: "var(--color-primary-green)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                textDecoration: "none",
                              }}
                            >
                              Activate Student Account <FiArrowRight size={14} />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Live Tuition Breakdown & FAQ Accordion */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2.25rem" }}>
            {/* Official Term Fee Schedule Table */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-lg)",
                padding: "1.5rem",
              }}
            >
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                  2026/2027 Billing Prospectus
                </div>
                <h2 style={{ color: "var(--color-navy-blue)", fontSize: "1.35rem", margin: "0.2rem 0 0 0" }}>
                  Term Tuition &amp; Fee Schedule
                </h2>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-primary)", textAlign: "left" }}>
                      <th style={{ padding: "0.65rem 0.5rem", color: "var(--text-muted)", fontWeight: 700 }}>Level</th>
                      <th style={{ padding: "0.65rem 0.5rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 700 }}>Tuition</th>
                      <th style={{ padding: "0.65rem 0.5rem", textAlign: "right", color: "var(--text-muted)", fontWeight: 700 }}>Levies &amp; ICT</th>
                      <th style={{ padding: "0.65rem 0.5rem", textAlign: "right", color: "var(--color-navy-blue)", fontWeight: 700 }}>Term Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialSchedules.map((sched) => (
                      <tr key={sched.levelGroup} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "0.7rem 0.5rem", fontWeight: 600, color: "var(--text-heading)" }}>
                          {sched.displayName}
                        </td>
                        <td style={{ padding: "0.7rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatNaira(sched.tuitionNaira)}
                        </td>
                        <td style={{ padding: "0.7rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                          {formatNaira(sched.leviesNaira + sched.maintenanceFeeNaira)}
                        </td>
                        <td style={{ padding: "0.7rem 0.5rem", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--color-primary-green)" }}>
                          {formatNaira(sched.totalNaira)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "0.75rem 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Includes term tuition, development levies, and portal ICT maintenance fee. Boarding fees are billed separately upon admission placement.
              </p>
            </div>

            {/* FAQ Accordion */}
            <div>
              <h2 style={{ color: "var(--color-navy-blue)", fontSize: "1.5rem", marginBottom: "1.25rem" }}>
                Frequently Asked Questions
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {FAQS.map((faq, index) => (
                  <div
                    key={index}
                    style={{
                      border: "1px solid var(--border-primary)",
                      borderRadius: "var(--radius-md)",
                      overflow: "hidden",
                      background: "var(--bg-card)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(openFaq === index ? null : index)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "1.15rem 1.25rem",
                        background: openFaq === index ? "var(--bg-secondary)" : "transparent",
                        border: "none",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "var(--color-navy-blue)",
                        fontSize: "1rem",
                      }}
                    >
                      {faq.question}
                      {openFaq === index ? <FiChevronUp /> : <FiChevronDown />}
                    </button>
                    {openFaq === index && (
                      <div
                        style={{
                          padding: "0.9rem 1.25rem 1.15rem",
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          lineHeight: 1.6,
                          borderTop: "1px solid var(--border-subtle)",
                          fontSize: "0.92rem",
                        }}
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: "2rem",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-primary)",
                  padding: "1.25rem",
                  borderRadius: "var(--radius-md)",
                  borderLeft: "4px solid var(--color-primary-green)",
                }}
              >
                <h4 style={{ color: "var(--color-navy-blue)", margin: "0 0 0.35rem 0" }}>Need Help?</h4>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
                  Call our admission desk at <strong>+234 802 345 6789</strong> or email{" "}
                  <strong>admissions@wofs.edu.ng</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
