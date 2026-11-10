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

  return (
    <AuthProvider>
      <div className={styles.layoutContainer}>
        <Sidebar />
        <main className={styles.mainContent}>{children}</main>
      </div>
    </AuthProvider>
  );
}
