"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { useSession } from "next-auth/react";

export default function CoursesPage() {
  const { data: session } = useSession();
  const [academics, setAcademics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (session?.user) {
        const res = await getStudentProfile(parseInt((session.user as any).id));
        if (res.success) setAcademics(res.academics || []);
        setLoading(false);
      }
    }
    load();
  }, [session]);

  if (loading) return <div style={{ padding: "2rem" }}>Loading course registrations...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Course Registration</h1>

      <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }}>
        <p style={{ marginBottom: "1.5rem", color: "var(--color-gray-800)" }}>Your registered subjects and assigned teachers for this session.</p>
        
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-gray-100)", borderBottom: "2px solid var(--color-gray-200)", textAlign: "left" }}>
              <th style={{ padding: "1rem" }}>Subject Code</th>
              <th style={{ padding: "1rem" }}>Subject Name</th>
              <th style={{ padding: "1rem" }}>Teacher</th>
              <th style={{ padding: "1rem" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {academics.length > 0 ? academics.map((ac, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid var(--color-gray-100)" }}>
                <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>{ac.subject.slice(0, 3).toUpperCase()}-101</td>
                <td style={{ padding: "1rem", fontWeight: 500, color: "var(--color-gray-900)" }}>{ac.subject}</td>
                <td style={{ padding: "1rem", color: "var(--color-gray-600)" }}>{ac.teacher}</td>
                <td style={{ padding: "1rem", color: "var(--color-primary-green)", fontWeight: 500 }}>Registered</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "var(--color-gray-500)", fontStyle: "italic" }}>
                  No courses registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
