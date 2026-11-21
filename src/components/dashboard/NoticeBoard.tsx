"use client";

import { useState, useEffect } from "react";
import styles from "./NoticeBoard.module.css";
import { getSchoolNotices } from "@/app/actions/elearning";
import { DEFAULT_SCHOOL_NOTICES, type SchoolNoticeItem } from "@/lib/noticeboard";

export default function NoticeBoard() {
  const [notices, setNotices] = useState<SchoolNoticeItem[]>(DEFAULT_SCHOOL_NOTICES);
  const [loaded, setLoaded] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSchoolNotices()
      .then((res) => {
        if (mounted && res.success && Array.isArray(res.notices)) {
          setNotices(res.notices);
          setLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Slideshow logic for mobile
  useEffect(() => {
    if (notices.length <= 1) return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % notices.length);
        setFade(true);
      }, 400);
    }, 5000);

    return () => clearInterval(interval);
  }, [notices.length]);

  const activeNotice = notices[currentIndex % notices.length] || notices[0];

  return (
    <div className={styles.container}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <h2 className={styles.headerTitle} style={{ margin: 0 }}>
          School Noticeboard &amp; Academic Calendar
        </h2>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--badge-success-text)", background: "var(--badge-success-bg)", padding: "0.2rem 0.65rem", borderRadius: "999px" }}>
          Live Broadcasts ({notices.length})
        </span>
      </div>

      {/* Desktop View: Flex Row */}
      {loaded && notices.length === 0 ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: "1.25rem",
            color: "var(--text-muted)",
            fontSize: "0.9rem",
          }}
        >
          No active school broadcasts right now.
        </div>
      ) : (
        <>
          <div className={styles.desktopView}>
            {notices.slice(0, 4).map((notice, idx) => (
              <div key={notice.id || idx} className={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", color: notice.color || "var(--color-primary-green)", fontWeight: 800, textTransform: "uppercase" }}>
                    {notice.type}
                  </span>
                  {notice.eventDate && (
                    <span style={{ fontSize: "0.72rem", background: "var(--color-gray-100)", color: "var(--color-gray-800)", padding: "0.12rem 0.45rem", borderRadius: "6px", fontWeight: 700 }}>
                      📅 {notice.eventDate}
                    </span>
                  )}
                </div>
                <h4 style={{ color: "var(--color-gray-900)", margin: "0.45rem 0", fontSize: "0.96rem" }}>{notice.title}</h4>
                <p style={{ color: "var(--color-gray-600)", fontSize: "0.86rem", margin: 0, lineHeight: 1.45 }}>{notice.details}</p>
                {notice.targetAudience && (
                  <div style={{ marginTop: "0.55rem", fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
                    Target: {notice.targetAudience}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mobile View: Animated Slideshow */}
          <div className={styles.mobileView}>
            {activeNotice && (
              <div className={`${styles.card} ${fade ? styles.fadeIn : styles.fadeOut}`} style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.78rem", color: activeNotice.color || "var(--color-primary-green)", fontWeight: "bold", textTransform: "uppercase" }}>
                    {activeNotice.type}
                  </span>
                  {activeNotice.eventDate && (
                    <span style={{ fontSize: "0.72rem", background: "var(--color-gray-100)", color: "var(--color-gray-800)", padding: "0.12rem 0.45rem", borderRadius: "6px", fontWeight: 700 }}>
                      📅 {activeNotice.eventDate}
                    </span>
                  )}
                </div>
                <h4 style={{ color: "var(--color-gray-900)", margin: "0.5rem 0" }}>{activeNotice.title}</h4>
                <p style={{ color: "var(--color-gray-600)", fontSize: "0.88rem", margin: 0 }}>{activeNotice.details}</p>
              </div>
            )}
            <div className={styles.dots}>
              {notices.map((_, idx) => (
                <span
                  key={idx}
                  className={`${styles.dot} ${idx === currentIndex ? styles.activeDot : ""}`}
                  onClick={() => {
                    setFade(false);
                    setTimeout(() => {
                      setCurrentIndex(idx);
                      setFade(true);
                    }, 250);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

