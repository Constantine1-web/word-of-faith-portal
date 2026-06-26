"use client";

import { useEffect, useState } from "react";
import { getAdminDashboardStats } from "@/app/actions/admin";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import AdmissionApplications from "./AdmissionApplications";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

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

  if (loading) return <p>Loading Admin Analytics...</p>;
  if (!data) return <p>Failed to load analytics.</p>;

  return (
    <div>
      <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
        Admin Overview
      </h3>
      
      {/* Top Stats Cards */}
      <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Total Students</p>
          <h2 style={{ color: "var(--color-navy-blue)", margin: 0 }}>{data.stats.totalStudents}</h2>
        </div>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Term Revenue (NGN)</p>
          <h2 style={{ color: "var(--color-primary-green)", margin: 0 }}>₦{data.stats.totalRevenue.toLocaleString()}</h2>
        </div>
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <p style={{ color: "var(--color-gray-500)", marginBottom: "0.5rem", fontSize: "0.9rem" }}>Total Teachers</p>
          <h2 style={{ color: "var(--color-navy-blue)", margin: 0 }}>{data.stats.totalTeachers}</h2>
        </div>
      </div>

      <div className="responsive-grid-large" style={{ marginBottom: "2rem" }}>
        {/* Revenue Line Chart */}
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--color-navy-blue)" }}>Monthly Revenue Trend</h4>
          <div style={{ height: "300px" }}>
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

        {/* Student Demographics Pie Chart */}
        <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ marginBottom: "1rem", color: "var(--color-navy-blue)" }}>Student Distribution</h4>
          <div style={{ height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.charts.studentDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
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

      {/* Admin Actions */}
      <h4 style={{ marginBottom: "1rem", color: "var(--color-navy-blue)" }}>Admin Actions</h4>
      <div className="responsive-grid">
        <div style={{ background: "var(--color-gray-50)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)" }}>
          <h4 style={{ marginBottom: "0.5rem" }}>Generate Scratch Cards</h4>
          <p style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>Generate a new batch of secure 12-digit PINs.</p>
          <button className="btn btn-primary" style={{ width: "100%" }}>Generate Batch</button>
        </div>
        <div style={{ background: "var(--color-gray-50)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-gray-200)" }}>
          <h4 style={{ marginBottom: "0.5rem" }}>Manage Users</h4>
          <p style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>Add new teachers, students, or admins.</p>
          <button className="btn btn-outline" style={{ width: "100%" }}>User Directory</button>
        </div>
      </div>

      <AdmissionApplications />
    </div>
  );
}
