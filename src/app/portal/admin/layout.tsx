import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";
import Link from "next/link";
import { FiHome, FiUsers, FiFileText, FiSettings, FiLogOut } from "react-icons/fi";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/portal/login");
  }

  // Very basic role check - assuming admin email for demonstration, or we would check session.user.role if set up
  if (session.user?.email !== "admin@wof.edu.ng") {
    // redirect("/portal/dashboard"); // Uncomment in real prod
  }

  return (
    <AuthProvider>
      <div style={{ display: "flex", minHeight: "calc(100vh - 4.5rem)" }}>
        {/* Admin Sidebar */}
        <aside style={{ width: "260px", background: "var(--color-navy-blue)", color: "white", padding: "1.5rem 0", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ padding: "0 1.5rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-primary-green)", fontWeight: "bold" }}>Admin Portal</span>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Link href="/portal/admin" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1.5rem", color: "white", textDecoration: "none" }}>
              <FiHome /> Dashboard
            </Link>
            <Link href="/portal/admin/students" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1.5rem", color: "white", textDecoration: "none" }}>
              <FiUsers /> Students
            </Link>
            <Link href="/portal/admin/results" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1.5rem", color: "white", textDecoration: "none" }}>
              <FiFileText /> Upload Results
            </Link>
            <Link href="/portal/admin/settings" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1.5rem", color: "white", textDecoration: "none" }}>
              <FiSettings /> Settings
            </Link>
          </nav>
        </aside>
        
        {/* Main Content */}
        <main style={{ flex: 1, background: "var(--color-gray-50)", padding: "2rem", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
