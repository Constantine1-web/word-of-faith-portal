"use client";

import React from "react";

export default function PrintButton() {
  return (
    <button 
      onClick={() => window.print()} 
      style={{ padding: "0.75rem 2rem", background: "black", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "1rem", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
    >
      Print Broad-Sheet
    </button>
  );
}
