"use client";

import { useEffect, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";

export default function AdmissionApplications() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const res = await fetch("/api/admissions");
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications);
      }
    } catch (error) {
      console.error("Failed to fetch applications", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      const res = await fetch("/api/admissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      if (res.ok) {
        setApplications(prev => prev.map(app => app.id === id ? { ...app, status } : app));
      }
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  if (loading) return <p>Loading Applications...</p>;

  return (
    <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", marginTop: "2rem" }}>
      <h4 style={{ marginBottom: "1rem", color: "var(--color-navy-blue)", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
        Recent Admission Applications
      </h4>
      
      {applications.length === 0 ? (
        <p style={{ color: "var(--color-gray-600)" }}>No pending applications.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-gray-50)", textAlign: "left" }}>
                <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-200)" }}>Child Name</th>
                <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-200)" }}>Class</th>
                <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-200)" }}>Parent Name</th>
                <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-200)" }}>Status</th>
                <th style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-200)", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.id}>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-100)" }}>{app.childFirstName} {app.childLastName}</td>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-100)" }}>{app.applyingClass}</td>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-100)" }}>
                    <div>{app.parentName}</div>
                    <div style={{ color: "var(--color-gray-500)", fontSize: "0.8rem" }}>{app.parentPhone}</div>
                  </td>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-100)" }}>
                    <span style={{ 
                      padding: "0.25rem 0.5rem", 
                      borderRadius: "12px", 
                      fontSize: "0.8rem",
                      background: app.status === "Approved" ? "rgba(34, 197, 94, 0.1)" : app.status === "Rejected" ? "rgba(239, 68, 68, 0.1)" : "rgba(234, 179, 8, 0.1)",
                      color: app.status === "Approved" ? "var(--color-primary-green)" : app.status === "Rejected" ? "#ef4444" : "#eab308"
                    }}>
                      {app.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid var(--color-gray-100)", textAlign: "right" }}>
                    {app.status === "Pending" && (
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                        <button onClick={() => updateStatus(app.id, "Approved")} style={{ background: "transparent", border: "1px solid var(--color-primary-green)", color: "var(--color-primary-green)", padding: "0.25rem", borderRadius: "var(--radius-sm)", cursor: "pointer" }} title="Approve">
                          <FiCheck />
                        </button>
                        <button onClick={() => updateStatus(app.id, "Rejected")} style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", padding: "0.25rem", borderRadius: "var(--radius-sm)", cursor: "pointer" }} title="Reject">
                          <FiX />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
