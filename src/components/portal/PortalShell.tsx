"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FiMenu, FiX } from "react-icons/fi";
import styles from "./PortalShell.module.css";

interface PortalShellProps {
  /** Label shown in the mobile bar next to the menu button. */
  title: string;
  /** Sidebar contents (header + nav links). Rendered on the server by the layout. */
  sidebar: ReactNode;
  /** CSS background for the sidebar (keeps each workspace's brand gradient). */
  sidebarBackground: string;
  /** Desktop sidebar width, e.g. "270px". */
  sidebarWidth?: string;
  children: ReactNode;
}

/**
 * Responsive two-column portal layout.
 * - < 1024px: sidebar is an off-canvas drawer opened from a menu button.
 * - >= 1024px: sidebar is a fixed-width column beside the content.
 */
export default function PortalShell({
  title,
  sidebar,
  sidebarBackground,
  sidebarWidth = "270px",
  children,
}: PortalShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the drawer; lock page scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.shell}>
      <div className={styles.mobileBar}>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="portal-sidebar"
        >
          <FiMenu />
        </button>
        <span className={styles.mobileTitle}>{title}</span>
      </div>

      <div
        className={`${styles.overlay} ${open ? styles.open : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="portal-sidebar"
        className={`${styles.sidebar} ${open ? styles.open : ""}`}
        style={{ background: sidebarBackground, "--sidebar-width": sidebarWidth } as CSSProperties}
        onClick={(e) => {
          // Tapping any link inside the drawer closes it (even same-route links).
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className={styles.drawerHeader}>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          >
            <FiX />
          </button>
        </div>
        {sidebar}
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
