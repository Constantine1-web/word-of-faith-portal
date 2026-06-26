"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { FiSun, FiMoon } from "react-icons/fi";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div style={{ width: "130px", height: "40px" }} />;

  const isDark = theme === "dark";

  return (
    <button
      className="theme-pill"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      style={{
        display: "flex",
        alignItems: "center",
        width: "130px",
        height: "40px",
        borderRadius: "20px",
        padding: "4px",
        background: isDark ? "#000000" : "#e5e7eb",
        border: isDark ? "1px solid #333" : "1px solid transparent",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.3s ease"
      }}
      aria-label="Toggle Theme"
    >
      {/* Animated Icon Circle */}
      <div style={{
        position: "absolute",
        top: "3px",
        left: isDark ? "4px" : "calc(100% - 35px)",
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "black",
        transition: "left 0.3s ease",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
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
          color: isDark ? "white" : "black",
          letterSpacing: "0.5px"
        }}>
        {isDark ? "NIGHT MODE" : "DAY MODE"}
      </div>
    </button>
  );
}
