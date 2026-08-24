"use client";

import { useEffect, useState } from "react";
import { getAdminDashboardStats } from "@/app/actions/admin";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";
import { FiCalendar, FiUsers, FiCreditCard, FiDollarSign, FiLayers, FiAward, FiUserPlus, FiArrowRight } from "react-icons/fi";

const COLORS = ['#0A2540', '#14532D', '#22C55E', '#3B82F6', '#F59E0B'];

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const res = await getAdminDashboardStats();
      if (res.success) {
        setData(res);
      }
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "var(--color-gray-500)" }}>
        Loading Admin Analytics & School Overview...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", textAlign: "center", color: "#b91c1c" }}>
        Failed to load administrative overview.
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
          <span style={{ background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid #4ade80", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem", fontWeight: "bold" }}>
            ADMIN EXECUTIVE SUITE
          </span>
          <h2 style={{ color: "white", margin: "0.5rem 0 0 0", fontSize: "1.75rem" }}>
            Word of Faith Schools Portal
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", opacity: 0.85, fontSize: "0.9rem" }}>
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

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #3b82f6" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Active Teaching Staff</p>
          <h2 style={{ color: "#2563eb", margin: 0 }}>{data.stats.totalTeachers}</h2>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", borderLeft: "4px solid #f59e0b" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Pending Action Items</p>
          <h2 style={{ color: "#d97706", margin: 0 }}>
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
              <div style={{ background: "#e0e7ff", color: "#4338ca", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiCalendar size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Session & Term Master</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Set active school term, lock/unlock score entries across the school.</p>
          </div>
        </Link>

        <Link href="/portal/admin/classes" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "#dbeafe", color: "#1e40af", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiLayers size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Classes & Form Masters</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Configure class arms (Gold, Blue) and assign 1-to-1 Form Masters.</p>
          </div>
        </Link>

        <Link href="/portal/admin/teachers" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "#dcfce7", color: "#15803d", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiUsers size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Subject Allocation</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Assign subject teachers to multiple class arms for active term.</p>
          </div>
        </Link>

        <Link href="/portal/admin/cards" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "#fef3c7", color: "#b45309", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiCreditCard size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Scratch Card Generator</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Generate 12-digit PIN result cards, print sticker sheets, export CSV.</p>
          </div>
        </Link>

        <Link href="/portal/admin/payments" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "#f1f5f9", color: "#334155", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiDollarSign size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Fee Clearance & Receipts</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Audit bank receipts, verify Paystack, and approve result access.</p>
          </div>
        </Link>

        <Link href="/portal/admin/admissions" style={{ textDecoration: "none" }}>
          <div className="hover-lift" style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div style={{ background: "#fae8ff", color: "#86198f", padding: "0.5rem", borderRadius: "8px", display: "flex" }}><FiUserPlus size={20} /></div>
              <h4 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Admissions & Onboarding</h4>
            </div>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.85rem", margin: 0 }}>Approve applications with auto-formatted registration numbering.</p>
          </div>
        </Link>
      </div>

      {/* Analytics Charts */}
      <div className="responsive-grid-large" style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--color-navy-blue)" }}>Revenue Trend (NGN)</h4>
          <div style={{ height: "260px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.charts.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: any) => `₦${value?.toLocaleString() || 0}`} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-primary-green)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--color-navy-blue)" }}>Student Distribution by Level</h4>
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
                  label
                >
                  {data.charts.studentDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
