"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  FiX
} from "react-icons/fi";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/portal/dashboard", icon: <FiHome /> },
  { 
    name: "Admissions", 
    icon: <FiUser />, 
    children: [
      { name: "Admission Notification", href: "/portal/admissions" }
    ]
  },
  { 
    name: "Fee Management", 
    icon: <FiCreditCard />, 
    children: [
      { name: "Other Payments", href: "/portal/fees/other" },
      { name: "Pay School Fee", href: "/portal/fees" },
      { name: "Transaction Status", href: "/portal/fees/status" },
      { name: "Payment History", href: "/portal/fees/history" }
    ]
  },
  { 
    name: "Profile Management", 
    icon: <FiUser />, 
    children: [
      { name: "Profile Update", href: "/portal/profile" }
    ]
  },
  { 
    name: "Academics", 
    icon: <FiBookOpen />, 
    children: [
      { name: "CBT Practice Portal", href: "/portal/cbt" }
    ]
  },
  { name: "Settings", href: "/portal/settings", icon: <FiSettings /> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "Fee Management": true,
    "Profile Management": true,
    "Academics": true,
  });

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      <div className={styles.mobileHeader}>
        <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Portal Menu</span>
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
          background: "rgba(46, 220, 133, 0.15)",
          backdropFilter: "blur(24px) saturate(200%)",
          WebkitBackdropFilter: "blur(24px) saturate(200%)",
          color: "white",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
          borderRadius: "30px",
          margin: "1rem",
          minHeight: "calc(100vh - 6.5rem)",
          maxHeight: "calc(100vh - 6.5rem)",
          width: "260px",
          maxWidth: "75vw",
          display: "flex",
          flexDirection: "column",
          padding: "1rem 0",
          zIndex: 50,
          overflowY: "auto",
          overflowX: "hidden"
        }}
      >
        <div style={{ padding: "1rem", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <img src="/logo.jpg" alt="Word of Faith Schools Logo" style={{ width: "60px", height: "60px", borderRadius: "50%", objectFit: "cover", background: "white", padding: "4px" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 1rem" }} className={styles.mobileOnly}>
          <button 
            className={styles.hamburgerBtn} 
            onClick={() => setIsMobileOpen(false)}
            style={{ display: isMobileOpen ? "block" : "none", marginBottom: "1rem", color: "white" }}
          >
            <FiX />
          </button>
        </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0 0.5rem" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const hasChildren = !!item.children;
          const isOpen = openMenus[item.name];

          return (
            <div key={item.name}>
              {hasChildren ? (
                <button 
                  onClick={() => toggleMenu(item.name)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.85rem 1.2rem",
                    margin: "0.25rem 0",
                    background: "transparent",
                    border: "none",
                    color: "white",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    borderRadius: "20px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "1.2rem" }}>{item.icon}</span>
                    {item.name}
                  </div>
                  {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                </button>
              ) : (
                <Link 
                  href={item.href || "#"} 
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.85rem 1.2rem",
                    margin: "0.25rem 0",
                    color: isActive ? "#111827" : "white",
                    background: isActive ? "#ffffff" : "transparent",
                    borderRadius: "20px",
                    textDecoration: "none",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    boxShadow: isActive ? "0 4px 10px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.3s ease"
                  }}
                >
                  <span style={{ fontSize: "1.2rem", color: isActive ? "var(--color-primary-green)" : "inherit" }}>{item.icon}</span>
                  {item.name}
                </Link>
              )}

              {/* Children Render */}
              {hasChildren && isOpen && (
                <div style={{ display: "flex", flexDirection: "column", marginTop: "0.25rem", marginLeft: "1.5rem", paddingLeft: "0.5rem", borderLeft: "2px solid rgba(255,255,255,0.1)" }}>
                  {item.children.map((child) => {
                    const isChildActive = pathname === child.href;
                    return (
                      <Link 
                        key={child.name} 
                        href={child.href}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.6rem 1rem",
                          margin: "0.15rem 0",
                          color: isChildActive ? "#111827" : "rgba(255,255,255,0.8)",
                          background: isChildActive ? "#ffffff" : "transparent",
                          borderRadius: "15px",
                          textDecoration: "none",
                          fontSize: "0.85rem",
                          fontWeight: isChildActive ? 600 : 400,
                          transition: "all 0.2s ease"
                        }}
                      >
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
    </>
  );
}
