"use client";

import { useEffect, useState } from "react";
import { getStudentProfile } from "@/app/actions/studentProfile";
import { updateProfile } from "@/app/actions/profile";
import { useSession } from "next-auth/react";

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      if (session?.user) {
        const res = await getStudentProfile(parseInt((session.user as any).id));
        if (res.success) setProfile(res.student);
        setLoading(false);
      }
    }
    load();
  }, [session]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("Saving...");
    const formData = new FormData(e.currentTarget);
    const res = await updateProfile(formData);
    
    if (res.success) {
      setStatus(res.message || "Success!");
      // Reload
      if (session?.user) {
        const pRes = await getStudentProfile(parseInt((session.user as any).id));
        if (pRes.success) setProfile(pRes.student);
      }
    } else {
      setStatus(`Error: ${res.error}`);
    }
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading profile...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <h1 style={{ color: "var(--color-navy-blue)", marginBottom: "2rem", borderBottom: "2px solid var(--color-gray-200)", paddingBottom: "1rem" }}>Profile Management</h1>

      <div style={{ background: "var(--color-white)", padding: "2rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", maxWidth: "800px" }}>
        
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Avatar Section */}
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
            <div style={{ width: "150px", height: "150px", borderRadius: "50%", background: "var(--color-gray-100)", border: "3px solid var(--color-primary-green)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "4rem" }}>
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
            </div>
            <span style={{ fontSize: "0.85rem", color: "var(--color-gray-500)", background: "var(--color-gray-100)", padding: "0.2rem 0.6rem", borderRadius: "var(--radius-full)" }}>Student</span>
          </div>

          {/* Details Form */}
          <form onSubmit={handleSubmit} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: "300px" }}>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "var(--color-gray-900)" }}>Registration No.</label>
                <input type="text" value={profile?.admissionNo || ""} disabled style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)", color: "var(--color-gray-600)" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "var(--color-gray-900)" }}>Class</label>
                <input type="text" value={profile?.className || ""} disabled style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)", color: "var(--color-gray-600)" }} />
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "var(--color-gray-900)" }}>Email Address</label>
              <input type="email" value={profile?.email || ""} disabled style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)", color: "var(--color-gray-600)" }} />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "var(--color-gray-900)" }}>Parent / Guardian Contact</label>
              <input type="text" name="parentContact" defaultValue={profile?.parentContact || ""} style={{ width: "100%", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-primary-green)", background: "var(--color-white)", color: "var(--color-gray-900)" }} />
              <p style={{ fontSize: "0.8rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>You can update this field.</p>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, color: "var(--color-gray-900)" }}>Update Avatar</label>
              <input type="file" name="avatar" accept="image/*" style={{ width: "100%", color: "var(--color-gray-900)" }} />
            </div>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start", padding: "0.75rem 2rem" }}>Save Changes</button>
            {status && <p style={{ color: status.includes("Error") ? "red" : "green", fontWeight: 500 }}>{status}</p>}

          </form>
        </div>

      </div>
    </div>
  );
}
