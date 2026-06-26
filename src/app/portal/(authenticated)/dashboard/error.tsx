"use client";

import { useEffect } from "react";
import { FiAlertTriangle } from "react-icons/fi";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log to an error reporting service
    console.error("Dashboard Boundary Caught:", error);
  }, [error]);

  return (
    <div style={{ 
      padding: "3rem 2rem", 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center",
      textAlign: "center",
      minHeight: "50vh"
    }}>
      <div style={{ color: "var(--color-red-500)", fontSize: "4rem", marginBottom: "1rem" }}>
        <FiAlertTriangle />
      </div>
      <h2 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Failed to load Dashboard</h2>
      <p style={{ color: "var(--color-gray-500)", maxWidth: "400px", marginBottom: "2rem" }}>
        We encountered a problem while fetching your dashboard data. This might be due to a temporary network issue.
      </p>
      <button 
        onClick={() => reset()} 
        className="btn btn-primary"
      >
        Try Again
      </button>
    </div>
  );
}
