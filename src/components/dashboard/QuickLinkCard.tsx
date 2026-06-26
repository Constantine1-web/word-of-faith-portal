"use client";

import Link from "next/link";
import React from "react";
import { motion } from "framer-motion";

interface QuickLinkCardProps {
  href: string;
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  title: string;
  subtitle: string;
}

export default function QuickLinkCard({ href, icon, iconBgColor, iconColor, title, subtitle }: QuickLinkCardProps) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <motion.div 
        whileHover={{ scale: 1.03, y: -5 }}
        whileTap={{ scale: 0.98 }}
        style={{ 
          background: "var(--color-white)", 
          padding: "1.5rem", 
          borderRadius: "var(--radius-md)", 
          boxShadow: "var(--shadow-sm)", 
          display: "flex", 
          alignItems: "center", 
          gap: "1rem", 
          cursor: "pointer",
          color: "inherit"
        }}
      >
        <div style={{ background: iconBgColor, color: iconColor, padding: "1rem", borderRadius: "50%", fontSize: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <div>
          <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.1rem", margin: 0, paddingBottom: "0.25rem" }}>{title}</h3>
          <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem", margin: 0 }}>{subtitle}</p>
        </div>
      </motion.div>
    </Link>
  );
}
