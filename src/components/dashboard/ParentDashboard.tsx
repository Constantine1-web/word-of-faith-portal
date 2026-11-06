"use client";

import { useEffect, useState } from "react";
import { getParentDashboardData, linkChildByAdmissionNo } from "@/app/actions/parent";
import Link from "next/link";
import {
  FiUsers,
  FiUserCheck,
  FiCreditCard,
  FiAward,
  FiCheckCircle,
  FiAlertCircle,
  FiPlusCircle,
  FiCalendar,
  FiMail,
  FiBookOpen,
  FiClock,
  FiX
} from "react-icons/fi";

export default function ParentDashboard({ session }: { session: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);

  // Link child modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [admissionNo, setAdmissionNo] = useState("");
  const [dob, setDob] = useState("");
  const [relationship, setRelationship] = useState("FATHER");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ success: boolean; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getParentDashboardData();
      if (res.success) {
        setData(res);
      } else {
        setErrorMsg(res.error || "Unable to fetch parent portal data.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Connection error while loading dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLinkChild = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkLoading(true);
    setLinkMsg(null);

    const res = await linkChildByAdmissionNo(admissionNo, dob, relationship);
    setLinkLoading(false);

    if (res.success) {
      setLinkMsg({ success: true, text: res.message || "Ward linked successfully!" });
      setAdmissionNo("");
      setDob("");
      setTimeout(() => {
        setShowLinkModal(false);
        setLinkMsg(null);
        fetchData();
      }, 1500);
    } else {
      setLinkMsg({ success: false, text: res.error || "Failed to link ward." });
    }
  };

  if (loading) {
    return (
      <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)" }}>
        Loading your Parent & Guardian Portal...
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "#b91c1c" }}>
        <p style={{ marginBottom: "1rem", fontWeight: 600 }}>{errorMsg}</p>
        <button onClick={fetchData} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  const wards = data?.wards || [];
  const currentChild = wards[selectedChildIndex] || null;

  return (
    <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      {/* Top Banner */}
      <div style={{
        background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
        color: "white",
        padding: "clamp(1.5rem, 3vw, 2rem)",
        borderRadius: "var(--radius-lg)",
        marginBottom: "2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "1rem",
        boxShadow: "var(--shadow-md)"
      }}>
        <div>
          <span style={{
            background: "rgba(34, 197, 94, 0.2)",
            color: "#4ade80",
            border: "1px solid #4ade80",
            padding: "0.2rem 0.6rem",
            borderRadius: "var(--radius-full)",
            fontSize: "0.8rem",
            fontWeight: "bold",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem"
          }}>
            <FiUsers /> PARENT & GUARDIAN PORTAL
          </span>
          <h1 style={{ color: "white", margin: "0.5rem 0 0 0", fontSize: "clamp(1.4rem, 4vw, 1.85rem)" }}>
            Welcome, {session?.user?.name || session?.user?.email?.split("@")[0]}
          </h1>
          <p style={{ margin: "0.25rem 0 0 0", opacity: 0.85, fontSize: "0.9rem" }}>
            Active Session / Term: <strong>{data.activeTerm}</strong>
          </p>
        </div>

        <button
          onClick={() => setShowLinkModal(true)}
          className="btn"
          style={{
            background: "rgba(255, 255, 255, 0.15)",
            color: "white",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
        >
          <FiPlusCircle /> Link Another Ward
        </button>
      </div>

      {/* Multi-Child Selector */}
      {wards.length === 0 ? (
        <div style={{
          background: "var(--color-white)",
          padding: "3rem 1.5rem",
          borderRadius: "var(--radius-lg)",
          textAlign: "center",
          boxShadow: "var(--shadow-sm)",
          border: "1px dashed var(--color-gray-300)"
        }}>
          <FiUsers size={48} color="var(--color-primary-green)" style={{ margin: "0 auto 1rem" }} />
          <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>No Students Linked Yet</h3>
          <p style={{ color: "var(--color-gray-600)", maxWidth: "500px", margin: "0 auto 1.5rem" }}>
            Connect your child or ward to this portal to monitor academic results, verify fee payments, and inspect daily attendance.
          </p>
          <button onClick={() => setShowLinkModal(true)} className="btn btn-primary">
            <FiPlusCircle /> Link Your Child Now
          </button>
        </div>
      ) : (
        <>
          {/* Child Switcher Pills */}
          <div style={{
            display: "flex",
            gap: "0.75rem",
            overflowX: "auto",
            paddingBottom: "0.75rem",
            marginBottom: "1.5rem",
            scrollbarWidth: "none"
          }}>
            {wards.map((ward: any, idx: number) => {
              const isSelected = idx === selectedChildIndex;
              return (
                <button
                  key={ward.studentId}
                  onClick={() => setSelectedChildIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem 1.25rem",
                    borderRadius: "var(--radius-full)",
                    border: isSelected ? "2px solid var(--color-primary-green)" : "1px solid var(--color-gray-200)",
                    background: isSelected ? "var(--color-primary-green)" : "var(--color-white)",
                    color: isSelected ? "#FFFFFF" : "var(--color-gray-800)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: isSelected ? "rgba(255,255,255,0.25)" : "var(--color-gray-100)",
                    color: isSelected ? "#FFFFFF" : "var(--color-navy-blue)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    fontSize: "0.85rem"
                  }}>
                    {ward.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>{ward.fullName}</div>
                    <div style={{ fontSize: "0.75rem", opacity: 0.85 }}>{ward.className} &bull; {ward.admissionNo}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {currentChild && (
            <div>
              {/* Selected Child Summary Banner */}
              <div style={{
                background: "var(--color-white)",
                borderRadius: "var(--radius-lg)",
                padding: "clamp(1.25rem, 3vw, 1.75rem)",
                boxShadow: "var(--shadow-sm)",
                border: "1px solid var(--color-gray-200)",
                marginBottom: "2rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1.25rem"
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <h2 style={{ color: "var(--color-navy-blue)", margin: 0, fontSize: "1.5rem" }}>
                      {currentChild.fullName}
                    </h2>
                    <span style={{
                      background: currentChild.isFeeCleared ? "#dcfce7" : "#fef3c7",
                      color: currentChild.isFeeCleared ? "#15803d" : "#b45309",
                      padding: "0.25rem 0.65rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem"
                    }}>
                      {currentChild.isFeeCleared ? <FiCheckCircle /> : <FiAlertCircle />}
                      {currentChild.isFeeCleared ? "Fees Cleared" : "Fees Pending"}
                    </span>
                  </div>
                  <p style={{ color: "var(--color-gray-600)", margin: "0.4rem 0 0 0", fontSize: "0.9rem" }}>
                    Class: <strong>{currentChild.className}</strong> ({currentChild.classLevel}) &bull; Reg No: <code style={{ fontWeight: "bold" }}>{currentChild.admissionNo}</code>
                  </p>
                  <p style={{ color: "var(--color-gray-500)", margin: "0.2rem 0 0 0", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <FiMail /> Form Master Contact: <strong>{currentChild.formMasterEmail}</strong>
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Link href={`/portal/fees`} className="btn btn-primary" style={{ fontSize: "0.9rem" }}>
                    <FiCreditCard /> Manage Fees
                  </Link>
                  <Link href={`/portal/results`} className="btn btn-outline" style={{ fontSize: "0.9rem" }}>
                    <FiAward /> Full Report Card
                  </Link>
                </div>
              </div>

              {/* 4 Performance Metric Cards */}
              <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
                <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--color-primary-green)" }}>
                  <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>Terminal Average</p>
                  <h2 style={{ color: "var(--color-primary-green)", margin: 0, fontSize: "1.8rem" }}>
                    {currentChild.averageScore}%
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)" }}>{currentChild.results.length} subjects assessed</span>
                </div>

                <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #3b82f6" }}>
                  <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>Attendance Record</p>
                  <h2 style={{ color: "#2563eb", margin: 0, fontSize: "1.8rem" }}>
                    {currentChild.attendance.attendanceRate}%
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)" }}>{currentChild.attendance.presentDays} of {currentChild.attendance.totalDays} sessions</span>
                </div>

                <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #8b5cf6" }}>
                  <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>CBT Practice Tests</p>
                  <h2 style={{ color: "#7c3aed", margin: 0, fontSize: "1.8rem" }}>
                    {currentChild.cbtAttempts.length}
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)" }}>Timed tests completed</span>
                </div>

                <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: `4px solid ${currentChild.isFeeCleared ? "#10b981" : "#f59e0b"}` }}>
                  <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.85rem" }}>Bursary Standing</p>
                  <h2 style={{ color: currentChild.isFeeCleared ? "#15803d" : "#b45309", margin: 0, fontSize: "1.8rem" }}>
                    {currentChild.isFeeCleared ? "CLEARED" : "DUE"}
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-gray-500)" }}>{data.activeTerm}</span>
                </div>
              </div>

              {/* Terminal Examination Results Table */}
              <div style={{
                background: "var(--color-white)",
                borderRadius: "var(--radius-lg)",
                padding: "clamp(1.25rem, 3vw, 1.75rem)",
                boxShadow: "var(--shadow-sm)",
                border: "1px solid var(--color-gray-200)",
                marginBottom: "2rem"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <h3 style={{ color: "var(--color-navy-blue)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FiAward color="var(--color-primary-green)" /> Terminal Academic Results
                  </h3>
                  <span style={{ fontSize: "0.85rem", color: "var(--color-gray-500)" }}>Continuous Assessment + Examination</span>
                </div>

                {currentChild.results.length === 0 ? (
                  <p style={{ color: "var(--color-gray-500)", fontStyle: "italic", textAlign: "center", padding: "1.5rem" }}>
                    No terminal results recorded yet for the active term.
                  </p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "550px" }}>
                      <thead>
                        <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Subject</th>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>CA (40%)</th>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Exam (60%)</th>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Total (100%)</th>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>WAEC Grade</th>
                          <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Teacher Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentChild.results.map((res: any, i: number) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                            <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{res.subject}</td>
                            <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>{res.caScore}</td>
                            <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>{res.examScore}</td>
                            <td style={{ padding: "0.85rem 1rem", textAlign: "center", fontWeight: "bold" }}>{res.totalScore}</td>
                            <td style={{ padding: "0.85rem 1rem", textAlign: "center", color: res.grade === "F" ? "#dc2626" : "#16a34a", fontWeight: "bold" }}>{res.grade}</td>
                            <td style={{ padding: "0.85rem 1rem", color: "var(--color-gray-600)", fontSize: "0.85rem" }}>{res.remark || "Satisfactory"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* CBT Practice Tests & Recent Payments Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 350px), 1fr))", gap: "1.5rem" }}>
                {/* CBT History Card */}
                <div style={{
                  background: "var(--color-white)",
                  borderRadius: "var(--radius-lg)",
                  padding: "1.5rem",
                  boxShadow: "var(--shadow-sm)",
                  border: "1px solid var(--color-gray-200)"
                }}>
                  <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FiBookOpen color="#7c3aed" /> CBT Practice History
                  </h4>
                  {currentChild.cbtAttempts.length === 0 ? (
                    <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem" }}>No CBT practice attempts recorded yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {currentChild.cbtAttempts.map((att: any) => (
                        <div key={att.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0.85rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-sm)" }}>
                          <div>
                            <strong style={{ fontSize: "0.9rem", color: "var(--color-navy-blue)" }}>{att.subjectCode.toUpperCase()}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>{new Date(att.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ fontWeight: "bold", fontSize: "0.95rem", color: att.scorePercent >= 50 ? "#16a34a" : "#dc2626" }}>
                            {att.scorePercent}%
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bursary Payments Card */}
                <div style={{
                  background: "var(--color-white)",
                  borderRadius: "var(--radius-lg)",
                  padding: "1.5rem",
                  boxShadow: "var(--shadow-sm)",
                  border: "1px solid var(--color-gray-200)"
                }}>
                  <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FiCreditCard color="var(--color-primary-green)" /> Term Payment Transactions
                  </h4>
                  {currentChild.recentPayments.length === 0 ? (
                    <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem" }}>No fee transactions recorded for this term.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {currentChild.recentPayments.map((pay: any) => (
                        <div key={pay.paymentId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0.85rem", background: "var(--color-gray-50)", borderRadius: "var(--radius-sm)" }}>
                          <div>
                            <strong style={{ fontSize: "0.9rem", color: "var(--color-navy-blue)" }}>{pay.description}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>{pay.channel} &bull; {new Date(pay.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: "bold", fontSize: "0.95rem" }}>₦{pay.amount.toLocaleString()}</div>
                            <span style={{ fontSize: "0.75rem", color: pay.status === "Approved" ? "#16a34a" : "#b45309", fontWeight: "bold" }}>{pay.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Link Child Modal */}
      {showLinkModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1200,
          padding: "1rem",
          backdropFilter: "blur(4px)"
        }}>
          <div className="modal-content" style={{
            background: "var(--color-white)",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            width: "100%",
            maxWidth: "480px",
            boxShadow: "var(--shadow-floating)",
            position: "relative"
          }}>
            <button
              onClick={() => { setShowLinkModal(false); setLinkMsg(null); }}
              style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "var(--color-gray-500)" }}
              aria-label="Close modal"
            >
              <FiX />
            </button>

            <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <FiUserCheck color="var(--color-primary-green)" /> Link Student to Your Portal
            </h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
              Enter your ward's school Registration Number and Date of Birth to verify identity and link records.
            </p>

            {linkMsg && (
              <div style={{
                padding: "0.75rem",
                borderRadius: "var(--radius-sm)",
                marginBottom: "1rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                background: linkMsg.success ? "#dcfce7" : "#fee2e2",
                color: linkMsg.success ? "#15803d" : "#b91c1c"
              }}>
                {linkMsg.text}
              </div>
            )}

            <form onSubmit={handleLinkChild} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.85rem" }}>Registration Number *</label>
                <input
                  type="text"
                  placeholder="e.g. WOF/2026/045"
                  className="form-input"
                  value={admissionNo}
                  onChange={(e) => setAdmissionNo(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.85rem" }}>Date of Birth *</label>
                <input
                  type="date"
                  className="form-input"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                <label className="form-label" style={{ fontSize: "0.85rem" }}>Your Relationship *</label>
                <select
                  className="form-input"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                >
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={linkLoading}
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "0.5rem" }}
              >
                {linkLoading ? "Verifying Record..." : "Confirm & Link Ward"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
