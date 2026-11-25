"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { FiSun, FiMoon } from "react-icons/fi";

const emptySubscribe = () => () => {};

export default function ThemeToggle() {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (!mounted) return <div style={{ width: "130px", height: "40px" }} />;

  const activeTheme = resolvedTheme ?? theme;
  const isDark = activeTheme === "dark";

  return (
    <button
      type="button"
      className="theme-pill"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-pressed={isDark}
      style={{
        display: "flex",
        alignItems: "center",
        width: "130px",
        height: "40px",
        borderRadius: "20px",
        padding: "4px",
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-primary)",
        cursor: "pointer",
        position: "relative",
        transition: "background-color var(--transition-theme), border-color var(--transition-theme)"
      }}
      aria-label={isDark ? "Switch to Day Mode" : "Switch to Night Mode"}
      title={isDark ? "Switch to Day Mode" : "Switch to Night Mode"}
    >
      {/* Animated Icon Circle */}
      <div style={{
        position: "absolute",
        top: "3px",
        left: isDark ? "4px" : "calc(100% - 35px)",
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-primary)",
        transition: "left 0.25s ease, background-color var(--transition-theme), color var(--transition-theme)",
        boxShadow: "var(--shadow-sm)"
      }}>
        {isDark ? <FiMoon size={16} /> : <FiSun size={16} />}
      </div>
      
      {/* Text Label */}
      <div 
        className="theme-text"
        style={{
          flex: 1,
          display: "flex",
          justifyContent: isDark ? "flex-end" : "flex-start",
          padding: isDark ? "0 12px 0 0" : "0 0 0 12px",
          fontSize: "0.7rem",
          fontWeight: "bold",
          color: "var(--text-primary)",
          letterSpacing: "0.5px"
        }}>
        {isDark ? "NIGHT MODE" : "DAY MODE"}
      </div>
    </button>
  );
}
