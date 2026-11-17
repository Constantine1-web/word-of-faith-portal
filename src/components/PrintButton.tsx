"use client";

import React from "react";

export default function PrintButton() {
  return (
    <button 
      onClick={() => window.print()} 
      className="btn btn-primary"
      style={{ padding: "0.75rem 2rem" }}
    >
      Print Broad-Sheet
    </button>
  );
}
