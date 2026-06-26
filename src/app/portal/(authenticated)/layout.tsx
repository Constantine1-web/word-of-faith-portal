import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import AuthProvider from "@/components/AuthProvider";
import styles from "@/components/dashboard/DashboardLayout.module.css";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/portal/login");
  }

  return (
    <AuthProvider>
      <div className={styles.layoutContainer}>
        {/* Sidebar handles its own mobile toggle and overlay internally */}
        <Sidebar />
        
        {/* Main Content Area */}
        <main className={styles.mainContent}>
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
