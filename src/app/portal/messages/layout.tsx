import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import AuthProvider from "@/components/AuthProvider";
import styles from "@/components/dashboard/DashboardLayout.module.css";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/portal/login?callbackUrl=/portal/messages");
  }

  // Restrict access: Students are not permitted in the in-app messaging section
  const userRoles: string[] = (
    (session?.user as any)?.roles || [session?.user?.role || "Student"]
  ).map((r: string) => String(r).toLowerCase());

  const isStaffOrParent = userRoles.some((r) =>
    [
      "admin",
      "super_admin",
      "principal",
      "bursar",
      "admissions",
      "teacher",
      "form_master",
      "parent",
    ].includes(r)
  );

  if (!isStaffOrParent) {
    redirect("/portal/dashboard");
  }

  return (
    <AuthProvider>
      <div className={styles.layoutContainer}>
        <Sidebar />
        <main className={styles.mainContent} style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
          <div style={{ flex: 1 }}>
            {children}
          </div>
          <footer
            style={{
              padding: "1.25rem 1.5rem",
              textAlign: "center",
              fontSize: "0.82rem",
              color: "var(--text-muted)",
              borderTop: "1px solid var(--border-subtle)",
              marginTop: "auto",
            }}
          >
            &copy; {new Date().getFullYear()} Word of Faith Schools. All Rights Reserved. · Academic &amp; Spiritual Excellence
          </footer>
        </main>
      </div>
    </AuthProvider>
  );
}
