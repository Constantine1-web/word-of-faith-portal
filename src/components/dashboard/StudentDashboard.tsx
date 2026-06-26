"use client";

import { useEffect, useState } from "react";
import { getStudentProfile, uploadPaymentReceipt } from "@/app/actions/studentProfile";
import { debounce } from "@/lib/debounce";
import Link from "next/link";
import { FiCreditCard, FiUser, FiFileText } from "react-icons/fi";
import InspirationSlideshow from "./InspirationSlideshow";
import NoticeBoard from "./NoticeBoard";
import QuickLinkCard from "./QuickLinkCard";

export default function StudentDashboard({ session }: { session: any }) {
  const [profile, setProfile] = useState<any>(null);
  const [academics, setAcademics] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");

  const handleUpload = debounce(async () => {
    setUploadStatus("Uploading...");
    // Mock student ID and term ID for demonstration
    const res = await uploadPaymentReceipt(profile?.id || 1, 1, "School Fees", 50000);
    setUploadStatus(res.success ? "Receipt uploaded and pending verification." : "Upload failed.");
  }, 1000);

  useEffect(() => {
    async function loadData() {
      if (session?.user?.id) {
        const studentId = parseInt(session.user.id);
        const res = await getStudentProfile(studentId);
        if (res.success) {
          setProfile(res.student);
          setAcademics(res.academics || []);
          setPayments(res.payments || []);
        }
      }
      setLoading(false);
    }
    loadData();
  }, [session]);

  if (loading) return <div style={{ padding: "2rem" }}><p>Loading your dashboard...</p></div>;

  const isPrimary = profile?.level === "Primary";

  return (
    <div style={{ padding: "2rem" }}>
      
      {/* Dynamic Profile Header */}
      <div style={{ 
        background: isPrimary 
          ? "linear-gradient(135deg, #059669, #047857)" 
          : "linear-gradient(135deg, var(--color-navy-blue), #1e3a8a)", 
        borderRadius: "var(--radius-lg)", 
        padding: "2rem", 
        color: "white", 
        marginBottom: "2rem", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        flexWrap: "wrap",
        gap: "1rem",
        boxShadow: "var(--shadow-md)" 
      }}>
        <div>
          <h1 style={{ fontSize: "clamp(1.25rem, 5vw, 2rem)", marginBottom: "0.5rem", color: "white", wordBreak: "break-word", lineHeight: 1.2 }}>
            {isPrimary ? "Hello there, Champion!" : "Welcome back,"} {profile?.preferredName || session?.user?.email?.split('@')[0]}
          </h1>
          <p style={{ color: isPrimary ? "rgba(255,255,255,0.9)" : "var(--color-gray-300)", fontSize: "1.1rem" }}>
            {profile?.className || "Class Not Assigned"}
          </p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.1)", padding: "1rem 2rem", borderRadius: "var(--radius-md)", backdropFilter: "blur(10px)" }}>
          <p style={{ fontSize: "0.9rem", color: isPrimary ? "rgba(255,255,255,0.9)" : "var(--color-gray-300)", marginBottom: "0.25rem" }}>Registration Number</p>
          <p style={{ fontSize: "1.5rem", fontWeight: "bold", fontFamily: "monospace" }}>{profile?.admissionNo || "N/A"}</p>
        </div>
      </div>

      <InspirationSlideshow />

      <div className="responsive-grid" style={{ marginBottom: "2rem" }}>
        
        {/* Quick Link Cards */}
        <QuickLinkCard 
          href="/portal/fees/history" 
          icon={<FiCreditCard />} 
          iconBgColor="rgba(59, 130, 246, 0.2)" 
          iconColor="#3b82f6" 
          title="Fee Status" 
          subtitle={`${payments.length} Transactions`} 
        />
        <QuickLinkCard 
          href="/portal/results" 
          icon={<FiFileText />} 
          iconBgColor="rgba(168, 85, 247, 0.2)" 
          iconColor="#a855f7" 
          title="My Results" 
          subtitle="Terminal Reports" 
        />
        <QuickLinkCard 
          href="/portal/profile" 
          icon={<FiUser />} 
          iconBgColor="rgba(249, 115, 22, 0.2)" 
          iconColor="#f97316" 
          title="Profile" 
          subtitle="Update Details" 
        />
      </div>

      {/* Upload Receipt Action */}
      <div style={{ background: "var(--color-white)", padding: "1.5rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", marginBottom: "2rem" }}>
        <h3 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Submit Payment Receipt</h3>
        <button 
          className="btn btn-primary" 
          onClick={() => handleUpload()}
          disabled={uploadStatus === "Uploading..."}
        >
          {uploadStatus === "Uploading..." ? "Uploading..." : "Upload Receipt (Demo)"}
        </button>
        {uploadStatus && <p style={{ marginTop: "0.5rem", color: "var(--color-primary-green)", fontWeight: "bold" }}>{uploadStatus}</p>}
      </div>

      <NoticeBoard />

    </div>
  );
}
