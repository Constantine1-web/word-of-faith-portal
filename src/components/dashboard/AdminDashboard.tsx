"use client";

import { useEffect, useState } from "react";
import { getAdminDashboardStats } from "@/app/actions/admin";
import {
  getSchoolNotices,
  publishSchoolNotice,
  deleteSchoolNotice,
  type SchoolNoticeItem,
} from "@/app/actions/elearning";
import {
  BROADCAST_DURATION_OPTIONS,
  formatRemainingBroadcastTime,
  type BroadcastDurationPreset,
} from "@/lib/noticeboard";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";
import {
  FiCalendar,
  FiUsers,
  FiCreditCard,
  FiDollarSign,
  FiLayers,
  FiAward,
  FiUserPlus,
  FiArrowRight,
  FiShield,
  FiBell,
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiClock,
  FiInbox,
  FiFileText,
  FiImage,
} from "react-icons/fi";

const COLORS = ['#0A2540', '#14532D', '#22C55E', '#3B82F6', '#F59E0B'];

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // School Noticeboard & Exam Timetable State (Track D)
  const [notices, setNotices] = useState<SchoolNoticeItem[]>([]);
  const [expiredNotices, setExpiredNotices] = useState<SchoolNoticeItem[]>([]);
  const [showExpiredNotices, setShowExpiredNotices] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeType, setNoticeType] = useState<"Upcoming Event" | "Deadline" | "Academics" | "Exam Timetable">("Academics");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeDetails, setNoticeDetails] = useState("");
  const [noticeEventDate, setNoticeEventDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [noticeAudience, setNoticeAudience] = useState("All Students & Parents");
  const [durationPreset, setDurationPreset] = useState<BroadcastDurationPreset>("7d");
  const [customExpiresAt, setCustomExpiresAt] = useState(() => {
    const dt = new Date(Date.now() + 7 * 24 * 3600_000);
    return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [publishingNotice, setPublishingNotice] = useState(false);
  const [busyNoticeId, setBusyNoticeId] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState("");

  const refreshNotices = async () => {
    const refreshed = await getSchoolNotices({ includeExpired: true });
    if (refreshed.success) {
      setNotices(refreshed.notices || []);
      setExpiredNotices(refreshed.expiredNotices || []);
    }
  };

  const resetNoticeForm = () => {
    setEditingNoticeId(null);
    setNoticeType("Academics");
    setNoticeTitle("");
    setNoticeDetails("");
    setNoticeEventDate(new Date().toISOString().split("T")[0]);
    setNoticeAudience("All Students & Parents");
    setDurationPreset("7d");
  };

  const fetchStats = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [res, noticeRes] = await Promise.all([
        getAdminDashboardStats(),
        getSchoolNotices({ includeExpired: true }),
      ]);
      if (noticeRes.success) {
        setNotices(noticeRes.notices || []);
        setExpiredNotices(noticeRes.expiredNotices || []);
      }
      if (res && res.stats) {
        setData(res);
        if (!res.success && res.error) {
          setErrorMsg(res.error);
        }
      } else {
        setErrorMsg((res as any)?.error || "Unable to fetch live metrics.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Connection error while loading analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleStartEditNotice = (n: SchoolNoticeItem) => {
    setEditingNoticeId(n.id);
    const validType = (["Upcoming Event", "Deadline", "Academics", "Exam Timetable"] as const).includes(
      n.type as "Upcoming Event" | "Deadline" | "Academics" | "Exam Timetable"
    )
      ? (n.type as "Upcoming Event" | "Deadline" | "Academics" | "Exam Timetable")
      : "Academics";
    setNoticeType(validType);
    setNoticeTitle(n.title);
    setNoticeDetails(n.details);
    setNoticeEventDate(
      /^\d{4}-\d{2}-\d{2}$/.test(n.eventDate || "")
        ? n.eventDate
        : new Date().toISOString().split("T")[0]
    );
    setNoticeAudience(n.targetAudience || "All Students & Parents");

    if (n.durationPreset && n.durationPreset !== "custom") {
      setDurationPreset(n.durationPreset);
    } else if (n.expiresAt && new Date(n.expiresAt).getTime() > Date.now() + 120_000) {
      const dt = new Date(n.expiresAt);
      setDurationPreset("custom");
      setCustomExpiresAt(
        new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
      );
    } else {
      setDurationPreset("7d");
    }
    setNoticeMsg("");
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoticeMsg("");
    setPublishingNotice(true);
    const res = await publishSchoolNotice({
      id: editingNoticeId || undefined,
      type: noticeType,
      title: noticeTitle,
      details: noticeDetails,
      eventDate: noticeEventDate,
      targetAudience: noticeAudience,
      durationPreset,
      customExpiresAt: durationPreset === "custom" ? new Date(customExpiresAt).toISOString() : undefined,
    });
    if (res.success) {
      const wasEdit = Boolean(editingNoticeId);
      resetNoticeForm();
      setNoticeMsg(
        wasEdit
          ? "Broadcast updated and synced across Student, Parent & Teacher dashboards."
          : "Broadcast published across Student, Parent & Teacher dashboards."
      );
      await refreshNotices();
    } else {
      setNoticeMsg(`Error: ${res.error || "Failed to publish notice."}`);
    }
    setPublishingNotice(false);
  };

  const handleDeleteNotice = async (notice: SchoolNoticeItem) => {
    if (!confirm(`Remove broadcast "${notice.title}" from all Student, Parent & Teacher dashboards?`)) {
      return;
    }
    setBusyNoticeId(notice.id);
    setNoticeMsg("");
    const res = await deleteSchoolNotice(notice.id);
    if (res.success) {
      if (editingNoticeId === notice.id) {
        resetNoticeForm();
      }
      setNoticeMsg(`Removed broadcast "${notice.title}".`);
      await refreshNotices();
    } else {
      setNoticeMsg(`Error: ${res.error || "Failed to remove notice."}`);
    }
    setBusyNoticeId(null);
  };

  if (loading) {
    return (
      <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)" }}>
        Loading Admin Analytics & School Overview...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--status-error-text)" }}>
        <p style={{ marginBottom: "1rem", fontWeight: 600 }}>
          {errorMsg || "Failed to load administrative overview."}
        </p>
        <button onClick={fetchStats} className="btn btn-primary">
          Retry Analytics Load
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Top Header / Active Clock Banner */}
      <div style={{
        background: "linear-gradient(135deg, #0A2540 0%, #14532D 100%)",
        color: "white",
        padding: "1.5rem 2rem",
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
          <span style={{ background: "rgba(0, 0, 0, 0.35)", color: "#86efac", border: "1px solid #4ade80", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold" }}>
            ADMIN EXECUTIVE SUITE
          </span>
          <h2 style={{ color: "white", margin: "0.5rem 0 0 0", fontSize: "1.75rem" }}>
            Word of Faith Schools Portal
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", color: "#f1f5f9", fontSize: "0.9rem" }}>
            Active Academic Clock: <strong>{data.stats.activeTerm}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/portal/admin/terms" className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FiCalendar /> Manage Term Clock
          </Link>
        </div>
      </div>
      
      {/* Top Key Performance Metrics */}
      <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--color-navy-blue)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Total Enrolled Students</p>
          <h2 style={{ color: "var(--color-navy-blue)", margin: 0 }}>{data.stats.totalStudents}</h2>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--color-primary-green)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Verified Term Revenue</p>
          <h2 style={{ color: "var(--color-primary-green)", margin: 0 }}>₦{data.stats.totalRevenue.toLocaleString()}</h2>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--accent-blue)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Active Teaching Staff</p>
          <h2 style={{ color: "var(--accent-blue)", margin: 0 }}>{data.stats.totalTeachers}</h2>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid var(--accent-amber)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Pending Action Items</p>
          <h2 style={{ color: "var(--accent-amber)", margin: 0 }}>
            {data.stats.pendingAdmissions + data.stats.pendingPayments} Items
          </h2>
        </div>
      </div>

      {/* Quick Access Control Matrix */}
      <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>
        Administrative Control Hub
      </h3>

      <div className="responsive-grid" style={{ marginBottom: "2.5rem" }}>
        <Link href="/portal/admin/terms" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-purple-bg)", color: "var(--status-purple-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiCalendar size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Session & Term Master</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Set active school term, lock/unlock score entries across the school.</p>
          </div>
        </Link>

        <Link href="/portal/admin/classes" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-info-bg)", color: "var(--status-info-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiLayers size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Classes &amp; Class Teachers</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Set up class groups (Gold, Blue) and assign a dedicated Class Teacher to each class.</p>
          </div>
        </Link>

        <Link href="/portal/admin/teachers" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiUsers size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Subject Allocation</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Assign subject teachers to multiple class arms for active term.</p>
          </div>
        </Link>

        <Link href="/portal/admin/cards" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-warning-bg)", color: "var(--status-warning-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiCreditCard size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Scratch Card Generator</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Generate 12-digit PIN result cards, print sticker sheets, export CSV.</p>
          </div>
        </Link>

        <Link href="/portal/admin/payments" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiDollarSign size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Fee Clearance & Receipts</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Audit bank receipts, verify Paystack, and approve result access.</p>
          </div>
        </Link>

        <Link href="/portal/admin/admissions" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-purple-bg)", color: "var(--status-purple-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiUserPlus size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Admissions &amp; Onboarding</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Approve applications with auto-generated WOFS Student IDs &amp; single-use invitations.</p>
          </div>
        </Link>

        <Link href="/portal/admin/inquiries" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ background: "var(--status-info-bg)", color: "var(--status-info-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiInbox size={20} /></div>
                <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Website Contact Inquiries</h4>
              </div>
              {(data.stats.openInquiries || 0) > 0 && (
                <span style={{ background: "var(--status-warning-bg)", color: "var(--status-warning-text)", border: "1px solid var(--status-warning-border)", padding: "0.15rem 0.55rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 800 }}>
                  {data.stats.openInquiries} New
                </span>
              )}
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Read messages submitted via the public Contact Us page and send official email replies.</p>
          </div>
        </Link>

        <Link href="/portal/admin/news" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-success-bg)", color: "var(--status-success-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiFileText size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Public News &amp; Events CMS</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Publish, update, or archive school articles displayed live on the public /news pages.</p>
          </div>
        </Link>

        <Link href="/portal/admin/gallery" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-purple-bg)", color: "var(--status-purple-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiImage size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Public Photo Gallery CMS</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Upload event photos, edit captions, set category tags, and curate the public /gallery showcase.</p>
          </div>
        </Link>

        <Link href="/portal/admin/attendance" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "var(--status-info-bg)", color: "var(--status-info-text)", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiCalendar size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Attendance Register</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Track daily class roll-call coverage, update statuses, and flag pupils below attendance thresholds.</p>
          </div>
        </Link>
      </div>

      {/* School-Wide Live Noticeboard, Academic Calendar & Exam Timetable Publisher (Track D) */}
      <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <FiBell color="var(--color-primary-green)" /> School Noticeboard, Academic Calendar &amp; Exam Timetable Publisher
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          gap: "1.5rem",
          marginBottom: "2.5rem",
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
              {editingNoticeId ? "Edit Broadcast Notice" : "Broadcast New Notice / Timetable Event"}
            </h4>
            {editingNoticeId && (
              <button
                type="button"
                onClick={resetNoticeForm}
                className="btn btn-outline"
                style={{ padding: "0.28rem 0.65rem", fontSize: "0.78rem" }}
              >
                Cancel Edit
              </button>
            )}
          </div>
          {noticeMsg && (
            <div
              style={{
                padding: "0.65rem 0.9rem",
                borderRadius: "6px",
                background: noticeMsg.startsWith("Error:") ? "var(--status-error-bg)" : "var(--status-success-bg)",
                color: noticeMsg.startsWith("Error:") ? "var(--status-error-text)" : "var(--status-success-text)",
                border: `1px solid ${noticeMsg.startsWith("Error:") ? "var(--status-error-border)" : "var(--status-success-border)"}`,
                fontSize: "0.84rem",
                fontWeight: 600,
                marginBottom: "0.85rem",
              }}
            >
              {noticeMsg}
            </div>
          )}
          <form onSubmit={handlePublishNotice} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                  Category
                </label>
                <select
                  className="form-input"
                  value={noticeType}
                  onChange={(e) => setNoticeType(e.target.value as any)}
                >
                  <option value="Academics">Academics</option>
                  <option value="Exam Timetable">Exam Timetable</option>
                  <option value="Deadline">Deadline</option>
                  <option value="Upcoming Event">Upcoming Event</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                  Event / Effective Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={noticeEventDate}
                  onChange={(e) => setNoticeEventDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                  Target Audience
                </label>
                <select
                  className="form-input"
                  value={noticeAudience}
                  onChange={(e) => setNoticeAudience(e.target.value)}
                >
                  <option value="All Students & Parents">All Students &amp; Parents</option>
                  <option value="All Students, Parents & Staff">All Students, Parents &amp; Staff</option>
                  <option value="Senior Secondary (SS1–SS3)">Senior Secondary (SS1–SS3)</option>
                  <option value="Junior Secondary (JSS1–JSS3)">Junior Secondary (JSS1–JSS3)</option>
                  <option value="Parents & Guardians">Parents &amp; Guardians</option>
                  <option value="Teaching & Academic Staff">Teaching &amp; Academic Staff</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                  Broadcast Visibility Period
                </label>
                <select
                  className="form-input"
                  value={durationPreset}
                  onChange={(e) => setDurationPreset(e.target.value as BroadcastDurationPreset)}
                >
                  {BROADCAST_DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {durationPreset === "custom" && (
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                  Auto-Expire Date &amp; Time *
                </label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={customExpiresAt}
                  onChange={(e) => setCustomExpiresAt(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                Headline / Title
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. First Term Examination Timetable Released"
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "var(--text-label)", marginBottom: "0.25rem" }}>
                Details / Schedule Instructions
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="e.g. Morning papers commence at 8:30 AM prompt. Students must bring their CBT examination slip."
                value={noticeDetails}
                onChange={(e) => setNoticeDetails(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={publishingNotice}
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              {editingNoticeId ? <FiEdit2 /> : <FiPlus />}{" "}
              {publishingNotice
                ? editingNoticeId
                  ? "Saving Changes..."
                  : "Broadcasting..."
                : editingNoticeId
                ? "Save Broadcast Changes"
                : "Publish to Live School Noticeboard"}
            </button>
          </form>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.5rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h4 style={{ margin: 0, color: "var(--text-heading)" }}>
              Active Broadcasts ({notices.length})
            </h4>
            {expiredNotices.length > 0 && (
              <button
                type="button"
                onClick={() => setShowExpiredNotices((prev) => !prev)}
                className="btn btn-outline"
                style={{ padding: "0.28rem 0.65rem", fontSize: "0.76rem" }}
              >
                {showExpiredNotices
                  ? "Hide Expired"
                  : `View Expired (${expiredNotices.length})`}
              </button>
            )}
          </div>
          <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Visible across Student, Parent, and Teacher noticeboards until edited, deleted, or expired.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "420px", overflowY: "auto" }}>
            {notices.length === 0 && !showExpiredNotices ? (
              <div
                style={{
                  padding: "1.5rem",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  border: "1px dashed var(--border-primary)",
                  borderRadius: "8px",
                  fontSize: "0.86rem",
                }}
              >
                No active broadcasts currently displayed to users.
              </div>
            ) : (
              (showExpiredNotices
                ? [
                    ...notices.map((n) => ({ ...n, _expired: false })),
                    ...expiredNotices.map((n) => ({ ...n, _expired: true })),
                  ]
                : notices.map((n) => ({ ...n, _expired: false }))
              ).map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    border: editingNoticeId === n.id
                      ? "1px solid var(--color-primary-green)"
                      : "1px solid var(--border-primary)",
                    background: "var(--bg-secondary)",
                    opacity: n._expired ? 0.72 : 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          color: n.color || "var(--color-navy-blue)",
                        }}
                      >
                        {n.type}
                      </span>
                      {n.eventDate && (
                        <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          · {n.eventDate}
                        </span>
                      )}
                      {n.targetAudience && (
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          · {n.targetAudience}
                        </span>
                      )}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.71rem",
                          fontWeight: 700,
                          padding: "0.12rem 0.45rem",
                          borderRadius: "4px",
                          border: "1px solid",
                          background: n._expired ? "var(--status-error-bg)" : "var(--bg-card)",
                          color: n._expired ? "var(--status-error-text)" : "var(--text-secondary)",
                          borderColor: n._expired ? "var(--status-error-border)" : "var(--border-primary)",
                        }}
                      >
                        <FiClock size={11} />{" "}
                        {n._expired ? "Expired" : formatRemainingBroadcastTime(n.expiresAt)}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, color: "var(--text-heading)", fontSize: "0.92rem" }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.2rem", lineHeight: 1.45 }}>
                      {n.details}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleStartEditNotice(n)}
                      title={n._expired ? "Edit & Re-broadcast" : "Edit Broadcast"}
                      style={{
                        background: "var(--bg-card)",
                        color: "var(--color-navy-blue)",
                        border: "1px solid var(--border-primary)",
                        borderRadius: "6px",
                        padding: "0.35rem 0.5rem",
                        cursor: "pointer",
                      }}
                    >
                      <FiEdit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNotice(n)}
                      disabled={busyNoticeId === n.id}
                      title="Delete Broadcast"
                      style={{
                        background: "var(--status-error-bg)",
                        color: "var(--status-error-text)",
                        border: "1px solid var(--status-error-border)",
                        borderRadius: "6px",
                        padding: "0.35rem 0.5rem",
                        cursor: "pointer",
                      }}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="responsive-grid-large" style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--text-heading)" }}>Revenue Trend (NGN)</h4>
          <div style={{ height: "260px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.charts.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="name" stroke="var(--border-primary)" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                <YAxis stroke="var(--border-primary)" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => `₦${value?.toLocaleString() || 0}`}
                  contentStyle={{ backgroundColor: "var(--bg-modal)", borderColor: "var(--border-primary)", color: "var(--text-primary)", borderRadius: "8px" }}
                  itemStyle={{ color: "var(--text-primary)" }}
                  labelStyle={{ color: "var(--text-heading)", fontWeight: 700 }}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-primary-green)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--text-heading)" }}>Student Distribution by Level</h4>
          <div style={{ height: "260px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.charts.studentDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={{ fill: "var(--text-primary)", fontSize: 12 }}
                >
                  {data.charts.studentDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--bg-modal)", borderColor: "var(--border-primary)", color: "var(--text-primary)", borderRadius: "8px" }}
                  itemStyle={{ color: "var(--text-primary)" }}
                  labelStyle={{ color: "var(--text-heading)", fontWeight: 700 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Immutable Security Audit Trail */}
      <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <FiShield color="var(--color-primary-green)" /> Immutable Security Audit Trail (ARCH-v3)
      </h3>
      <div
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          border: "1px solid var(--color-gray-200)",
          overflowX: "auto",
          marginBottom: "2rem"
        }}
      >
        {!data.recentAuditLogs || data.recentAuditLogs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)" }}>
            No security audit events recorded yet. Actions on scores, locks, payments, and user accounts will appear here.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", borderBottom: "2px solid var(--color-gray-200)" }}>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Timestamp</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Action</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Actor Roles</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Target Entity</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>Reason / Metadata</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAuditLogs.map((log: any) => (
                <tr key={String(log.id)} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--color-gray-600)", whiteSpace: "nowrap" }}>
                    {new Date(log.CreatedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--color-navy-blue)", fontFamily: "monospace" }}>
                    {log.Action}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--accent-green)", fontWeight: 600 }}>
                    {log.NewValue?.actorRoles || (log.ActorID ? `User #${log.ActorID}` : "SYSTEM")}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace" }}>
                    {log.Entity} #{log.EntityID}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--color-gray-600)", fontSize: "0.82rem" }}>
                    {log.NewValue?.reason || (log.NewValue ? JSON.stringify(log.NewValue).slice(0, 90) : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

