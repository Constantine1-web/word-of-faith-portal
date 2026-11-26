"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import Link from "next/link";
import { FiCreditCard, FiUser, FiFileText, FiUploadCloud, FiAward, FiShield } from "react-icons/fi";
import InspirationSlideshow from "./InspirationSlideshow";
import NoticeBoard from "./NoticeBoard";
import QuickLinkCard from "./QuickLinkCard";

interface StudentDashboardOverview {
  termLabel: string;
  attendance: {
    totalMarked: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    attendanceRatePct: number | null;
  };
  fees: {
    expectedNaira: number;
    paidNaira: number;
    balanceNaira: number;
    isCleared: boolean;
  };
  cbt: {
    completedAttempts: number;
    averageScorePct: number;
    bestScorePct: number;
    subjectTrends: Array<{
      subjectCode: string;
      subjectLabel: string;
      attempts: number;
      averageScorePct: number;
      bestScorePct: number;
    }>;
  };
}

export default function StudentDashboard({ session }: { session: any }) {
  const [profile, setProfile] = useState<any>(null);
  const [academics, setAcademics] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [overview, setOverview] = useState<StudentDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (session?.user?.id) {
        const studentId = parseInt(session.user.id);
        const res = await getStudentProfile(studentId);
        if (res.success && res.student) {
          setProfile(res.student);
          setAcademics(res.academics || []);
          setPayments(res.payments || []);
          setOverview("overview" in res ? res.overview ?? null : null);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [session]);

  if (loading) return <div style={{ padding: "2rem" }}><p>Loading your dashboard...</p></div>;

  const isPrimary = profile?.level === "Primary";

  return (
    <div style={{ padding: "clamp(1rem, 2.5vw, 2rem)" }}>
      
      {/* Dynamic Profile Header */}
      <div style={{ 
        background: isPrimary 
          ? "linear-gradient(135deg, #14532D, #065F46)" 
          : "linear-gradient(135deg, #0A2540, #1E3A8A)", 
        borderRadius: "var(--radius-lg)", 
        padding: "clamp(1.25rem, 3vw, 2rem)", 
        color: "#FFFFFF", 
        marginBottom: "2rem", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        flexWrap: "wrap",
        gap: "1rem",
        boxShadow: "var(--shadow-md)" 
      }}>
        <div>
          <h1 style={{ fontSize: "clamp(1.25rem, 5vw, 2rem)", marginBottom: "0.5rem", color: "#FFFFFF", wordBreak: "break-word", lineHeight: 1.2 }}>
            {isPrimary ? "Hello there, Champion!" : "Welcome back,"} {profile?.preferredName || session?.user?.email?.split('@')[0]}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.88)", fontSize: "1.1rem" }}>
            {profile?.className || "Class Not Assigned"}
          </p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.12)", padding: "1rem 2rem", borderRadius: "var(--radius-md)", backdropFilter: "blur(10px)" }}>
          <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.88)", marginBottom: "0.25rem" }}>WOFS Student ID</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", fontFamily: "monospace", color: "#FFFFFF" }}>{profile?.admissionNo || "N/A"}</p>
        </div>
      </div>

      <InspirationSlideshow />

      {overview && (
        <section style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--color-navy-blue)", margin: 0 }}>
              Term Overview
            </h2>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {overview.termLabel}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-md)",
                padding: "1.1rem 1.25rem",
              }}
            >
              <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                Term Attendance
              </div>
              <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-navy-blue)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
                {overview.attendance?.attendanceRatePct !== null && overview.attendance?.attendanceRatePct !== undefined
                  ? `${overview.attendance.attendanceRatePct}%`
                  : "—"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {overview.attendance?.totalMarked > 0
                  ? `${overview.attendance.present} Present · ${overview.attendance.late} Late · ${overview.attendance.absent} Absent`
                  : "No daily roll-call recorded yet"}
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-md)",
                padding: "1.1rem 1.25rem",
              }}
            >
              <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                Fee Clearance
              </div>
              <div
                style={{
                  fontSize: "1.65rem",
                  fontWeight: 800,
                  color: overview.fees?.isCleared ? "var(--color-primary-green)" : "var(--color-navy-blue)",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: "0.2rem",
                }}
              >
                {overview.fees?.isCleared
                  ? "Cleared"
                  : `₦${Number(overview.fees?.balanceNaira || 0).toLocaleString("en-NG")} Due`}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Paid ₦{Number(overview.fees?.paidNaira || 0).toLocaleString("en-NG")} of ₦{Number(overview.fees?.expectedNaira || 0).toLocaleString("en-NG")}
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-md)",
                padding: "1.1rem 1.25rem",
              }}
            >
              <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                CBT Practice Standing
              </div>
              <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--color-navy-blue)", fontVariantNumeric: "tabular-nums", marginTop: "0.2rem" }}>
                {overview.cbt?.completedAttempts > 0 ? `${overview.cbt.averageScorePct}%` : "—"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {overview.cbt?.completedAttempts > 0
                  ? `${overview.cbt.completedAttempts} test(s) · Highest ${overview.cbt.bestScorePct}%`
                  : "Complete a practice test in CBT Exam Hall"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
              gap: "1rem",
            }}
          >
            {/* Enrolled Class Subjects Ledger */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-md)",
                padding: "1.15rem 1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.95rem", color: "var(--color-navy-blue)" }}>
                  Registered Class Subjects ({academics.length})
                </h3>
              </div>
              {academics.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-muted)" }}>
                  No subjects mapped to your class arm yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {academics.slice(0, 6).map((subj, idx) => (
                    <div
                      key={`${subj.SubjectName}-${idx}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.42rem 0",
                        borderBottom: idx < Math.min(academics.length, 6) - 1 ? "1px solid var(--border-subtle)" : "none",
                        fontSize: "0.85rem",
                        gap: "0.75rem",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--text-heading)" }}>{subj.SubjectName}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{subj.TeacherName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CBT Subject Progress Bars */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-md)",
                padding: "1.15rem 1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.95rem", color: "var(--color-navy-blue)" }}>
                  CBT Subject Progress
                </h3>
                <Link href="/portal/cbt" style={{ fontSize: "0.8rem", color: "var(--color-primary-green)", fontWeight: 600, textDecoration: "none" }}>
                  CBT Hall →
                </Link>
              </div>
              {!overview.cbt?.subjectTrends?.length ? (
                <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
                  Your subject averages appear here as soon as you finish timed or practice sessions in the CBT Exam Hall.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                  {overview.cbt.subjectTrends.map((t: { subjectCode: string; subjectLabel: string; averageScorePct: number; attempts: number }) => (
                    <div key={t.subjectCode}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.83rem", marginBottom: "0.25rem" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-heading)" }}>
                          {t.subjectLabel} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({t.attempts}x)</span>
                        </span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--color-navy-blue)" }}>
                          {t.averageScorePct}%
                        </span>
                      </div>
                      <div style={{ height: "5px", width: "100%", background: "var(--bg-secondary)", borderRadius: "3px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, Math.max(0, t.averageScorePct))}%`,
                            background: t.averageScorePct >= 50 ? "var(--color-primary-green)" : "var(--color-navy-blue)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
        
        {/* Quick Link Cards */}
        <QuickLinkCard 
          href="/portal/exam-room" 
          icon={<FiShield />} 
          iconBgColor="var(--status-success-bg)" 
          iconColor="var(--color-primary-green)" 
          title="Examination Room" 
          subtitle="Official Subject Exams" 
        />
        <QuickLinkCard 
          href="/portal/cbt" 
          icon={<FiAward />} 
          iconBgColor="var(--status-purple-bg)" 
          iconColor="var(--accent-purple)" 
          title="CBT Practice" 
          subtitle="Mocks & Self-Study" 
        />
        <QuickLinkCard 
          href="/portal/results" 
          icon={<FiFileText />} 
          iconBgColor="var(--status-purple-bg)" 
          iconColor="var(--accent-purple)" 
          title="My Results" 
          subtitle="Terminal Reports" 
        />
        <QuickLinkCard 
          href="/portal/fees/history" 
          icon={<FiCreditCard />} 
          iconBgColor="var(--status-info-bg)" 
          iconColor="var(--accent-blue)" 
          title="Fee Status" 
          subtitle={`${payments.length} Transactions`} 
        />
        <QuickLinkCard 
          href="/portal/profile" 
          icon={<FiUser />} 
          iconBgColor="var(--status-warning-bg)" 
          iconColor="var(--accent-orange)" 
          title="Profile" 
          subtitle="Update Details" 
        />
      </div>

      {/* Dedicated Examination Room Entry Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #0A2540, #1E3A8A)",
          padding: "1.4rem 1.5rem",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          marginBottom: "1.25rem",
          color: "#FFFFFF",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h3 style={{ color: "#FFFFFF", margin: "0 0 0.25rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiShield color="#4ade80" /> Official Subject Examination Room
          </h3>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.86)", fontSize: "0.9rem" }}>
            Writing a scheduled CA test, midterm, or terminal CBT exam today? Enter your Subject Examination Room with your morning room code.
          </p>
        </div>
        <Link
          href="/portal/exam-room"
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", fontWeight: 800 }}
        >
          <FiShield size={18} />
          <span>Enter Examination Room</span>
        </Link>
      </div>

      {/* Pay Fees & Upload Teller Receipt Action */}
      <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h3 style={{ color: "var(--color-navy-blue)", margin: "0 0 0.25rem 0" }}>School Fees & Billing Portal</h3>
          <p style={{ margin: 0, color: "var(--color-gray-600)", fontSize: "0.9rem" }}>Make direct Paystack card/transfer payments or upload verified bank teller receipts.</p>
        </div>
        <Link 
          href="/portal/fees" 
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}
        >
          <FiUploadCloud size={18} />
          <span>Pay Fees & Upload Receipt</span>
        </Link>
      </div>

      <NoticeBoard />

    </div>
  );
}
