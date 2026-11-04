"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FiX } from "react-icons/fi";
import { useMobileDrawer } from "@/lib/useMobileDrawer";
import styles from "./PortalShell.module.css";

interface PortalShellProps {
  /** Label for the workspace (used as the drawer's accessible name). */
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
 * - < 1024px: sidebar is an off-canvas drawer toggled by the navbar hamburger (left side).
 *   It leaves a visible strip of the page, auto-closes after 10s idle, and
 *   collapses via the same hamburger, the X button, or a tap on the page.
 * - >= 1024px: sidebar is a fixed-width column beside the content.
 */
export default function PortalShell({
  title,
  sidebar,
  sidebarBackground,
  sidebarWidth = "270px",
  children,
}: PortalShellProps) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const { open, setOpen } = useMobileDrawer(drawerRef);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.overlay} ${open ? styles.open : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="portal-sidebar"
        ref={drawerRef}
        aria-label={`${title} navigation`}
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
