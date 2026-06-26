"use client";

import { useState, useEffect } from "react";
import styles from "./NoticeBoard.module.css";

const NOTICES = [
  {
    type: "Upcoming Event",
    color: "var(--color-primary-green)",
    title: "PTA General Meeting",
    details: "Sep 04, 2026 - Main Auditorium. All parents are expected."
  },
  {
    type: "Deadline",
    color: "red",
    title: "School Fees Payment",
    details: "Oct 01, 2026 - Please clear all outstanding balances."
  },
  {
    type: "Academics",
    color: "var(--color-navy-blue)",
    title: "First Term Exams",
    details: "Nov 15, 2026 - Time tables will be distributed next week."
  }
];

export default function NoticeBoard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

  // Slideshow logic for mobile
  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % NOTICES.length);
        setFade(true);
      }, 500);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.container}>
      <h2 className={styles.headerTitle}>Notice Board</h2>
      
      {/* Desktop View: Flex Row */}
      <div className={styles.desktopView}>
        {NOTICES.map((notice, idx) => (
          <div key={idx} className={styles.card}>
            <span style={{ fontSize: "0.8rem", color: notice.color, fontWeight: "bold", textTransform: "uppercase" }}>
              {notice.type}
            </span>
            <h4 style={{ color: "var(--color-gray-900)", margin: "0.5rem 0" }}>{notice.title}</h4>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", margin: 0 }}>{notice.details}</p>
          </div>
        ))}
      </div>

      {/* Mobile View: Animated Slideshow */}
      <div className={styles.mobileView}>
        <div className={`${styles.card} ${fade ? styles.fadeIn : styles.fadeOut}`} style={{ width: "100%" }}>
          <span style={{ fontSize: "0.8rem", color: NOTICES[currentIndex].color, fontWeight: "bold", textTransform: "uppercase" }}>
            {NOTICES[currentIndex].type}
          </span>
          <h4 style={{ color: "var(--color-gray-900)", margin: "0.5rem 0" }}>{NOTICES[currentIndex].title}</h4>
          <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", margin: 0 }}>{NOTICES[currentIndex].details}</p>
        </div>
        <div className={styles.dots}>
          {NOTICES.map((_, idx) => (
            <span 
              key={idx} 
              className={`${styles.dot} ${idx === currentIndex ? styles.activeDot : ""}`}
              onClick={() => {
                setFade(false);
                setTimeout(() => {
                  setCurrentIndex(idx);
                  setFade(true);
                }, 300);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
