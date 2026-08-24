"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import styles from "./DashboardLayout.module.css";
import { 
  FiHome, 
  FiUser, 
  FiCreditCard, 
  FiBookOpen, 
  FiFileText, 
  FiSettings, 
  FiChevronDown, 
  FiChevronRight, 
  FiMenu, 
  FiX, 
  FiCalendar, 
  FiUsers, 
  FiLayers, 
  FiAward, 
  FiDollarSign, 
  FiUserCheck, 
  FiLogOut 
} from "react-icons/fi";

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "Academic Setup": true,
    "Student Affairs": true,
    "Fee Management": true,
    "Academics": true,
  });

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const userRole = session?.user?.role?.toLowerCase() || "student";

  // Build role-tailored navigation items
  const getNavItems = () => {
    if (userRole === "admin") {
      return [
        { name: "Overview", href: "/portal/dashboard", icon: <FiHome /> },
        { 
          name: "Academic Setup", 
          icon: <FiCalendar />, 
          children: [
            { name: "Session & Term Master", href: "/portal/admin/terms" },
            { name: "Classes & Form Masters", href: "/portal/admin/classes" },
            { name: "Subject Allocations", href: "/portal/admin/teachers" },
          ]
        },
        { 
          name: "Student Affairs", 
          icon: <FiUsers />, 
          children: [
            { name: "Admissions Review", href: "/portal/admin/admissions" },
            { name: "Student Directory", href: "/portal/admin/students" },
            { name: "User Accounts", href: "/portal/admin/users" },
          ]
        },
        { 
          name: "Finance & Cards", 
          icon: <FiCreditCard />, 
          children: [
            { name: "Scratch Card Generator", href: "/portal/admin/cards" },
            { name: "Fee Approvals", href: "/portal/admin/payments" },
          ]
        },
        { 
          name: "Examinations", 
          icon: <FiAward />, 
          children: [
            { name: "Result Broadsheets", href: "/portal/admin/results" },
            { name: "CBT Portal", href: "/portal/cbt" },
          ]
        },
      ];
    }

    if (userRole === "teacher") {
      return [
        { name: "Teacher Dashboard", href: "/portal/dashboard", icon: <FiHome /> },
        { 
          name: "Academics", 
          icon: <FiBookOpen />, 
          children: [
            { name: "Score Entry & CA", href: "/portal/dashboard" },
            { name: "CBT Exams", href: "/portal/cbt" },
          ]
        },
        { name: "Messages", href: "/portal/messages", icon: <FiFileText /> },
        { name: "My Profile", href: "/portal/profile", icon: <FiUser /> },
      ];
    }

    // Default: Student / Parent
    return [
      { name: "Student Dashboard", href: "/portal/dashboard", icon: <FiHome /> },
      { 
        name: "Academics", 
        icon: <FiBookOpen />, 
        children: [
          { name: "Check Results", href: "/portal/results" },
          { name: "CBT Practice", href: "/portal/cbt" },
        ]
      },
      { 
        name: "Fee Management", 
        icon: <FiCreditCard />, 
        children: [
          { name: "Pay School Fees", href: "/portal/fees" },
          { name: "Payment History", href: "/portal/fees/history" },
        ]
      },
      { name: "My Profile", href: "/portal/profile", icon: <FiUser /> },
    ];
  };

  const navItems = getNavItems();

  return (
    <>
      <div className={styles.mobileHeader}>
        <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
          {userRole === "admin" ? "Admin Suite" : userRole === "teacher" ? "Teacher Portal" : "Student Portal"}
        </span>
        <button className={styles.hamburgerBtn} onClick={() => setIsMobileOpen(true)}>
          <FiMenu />
        </button>
      </div>
      
      <div 
        className={`${styles.overlay} ${isMobileOpen ? styles.open : ""}`} 
        onClick={() => setIsMobileOpen(false)} 
      />

      <aside 
        className={[styles.sidebarWrapper, isMobileOpen ? styles.open : ""].filter(Boolean).join(" ")}
        style={{
          background: "rgba(10, 37, 64, 0.95)",
          backdropFilter: "blur(24px) saturate(200%)",
          WebkitBackdropFilter: "blur(24px) saturate(200%)",
          color: "white",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
          borderRadius: "20px",
          margin: "1rem",
          minHeight: "calc(100vh - 6.5rem)",
          maxHeight: "calc(100vh - 6.5rem)",
          width: "260px",
          maxWidth: "75vw",
          display: "flex",
          flexDirection: "column",
          padding: "1.25rem 0",
          zIndex: 90
        }}
      >
        {/* User Info Header */}
        <div style={{ padding: "0 1.25rem 1.25rem 1.25rem", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: userRole === "admin" ? "#ef4444" : userRole === "teacher" ? "#3b82f6" : "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "1.1rem"
            }}>
              {session?.user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: "bold", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {session?.user?.email || "User"}
              </div>
              <div style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: userRole === "admin" ? "#fca5a5" : userRole === "teacher" ? "#93c5fd" : "#86efac",
                fontWeight: "600"
              }}>
                {userRole}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className={styles.navContainer} style={{ flex: 1, overflowY: "auto", padding: "1rem 0.75rem" }}>
          {navItems.map((item) => {
            if (item.children) {
              const isOpen = openMenus[item.name] ?? false;
              const hasActiveChild = item.children.some(c => pathname === c.href);

              return (
                <div key={item.name} style={{ marginBottom: "0.5rem" }}>
                  <button
                    onClick={() => toggleMenu(item.name)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.75rem",
                      background: hasActiveChild ? "rgba(255, 255, 255, 0.1)" : "transparent",
                      border: "none",
                      color: "white",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: "600"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
                      <span>{item.name}</span>
                    </div>
                    {isOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                  </button>

                  {isOpen && (
                    <div style={{ paddingLeft: "2.25rem", marginTop: "0.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {item.children.map((sub) => {
                        const isActive = pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setIsMobileOpen(false)}
                            style={{
                              padding: "0.45rem 0.6rem",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "0.85rem",
                              color: isActive ? "#4ade80" : "rgba(255, 255, 255, 0.8)",
                              fontWeight: isActive ? "bold" : "normal",
                              background: isActive ? "rgba(74, 222, 128, 0.15)" : "transparent",
                              textDecoration: "none",
                              transition: "all 0.2s ease"
                            }}
                          >
                            {sub.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => setIsMobileOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "var(--radius-md)",
                  color: isActive ? "#4ade80" : "white",
                  background: isActive ? "rgba(74, 222, 128, 0.15)" : "transparent",
                  fontWeight: isActive ? "bold" : "600",
                  fontSize: "0.9rem",
                  textDecoration: "none",
                  marginBottom: "0.5rem",
                  transition: "all 0.2s ease"
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <button
            onClick={() => signOut({ callbackUrl: "/portal/login" })}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem",
              background: "rgba(239, 68, 68, 0.2)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: "600",
              justifyContent: "center"
            }}
          >
            <FiLogOut /> Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
