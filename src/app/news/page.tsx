import { FiCalendar, FiArrowRight } from "react-icons/fi";
import Link from "next/link";
import { newsItems } from "@/data/news";

export default function News() {

  return (
    <div>
      {/* Hero Section */}
      <section style={{ 
        background: "var(--bg-dark)",
        padding: "6rem 1rem",
        color: "white",
        textAlign: "center",
        borderBottom: "4px solid var(--color-primary-green)"
      }}>
        <div className="container" style={{ maxWidth: "800px" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1rem", color: "white" }}>News & Events</h1>
          <p style={{ fontSize: "1.2rem", color: "rgba(255, 255, 255, 0.9)" }}>
            Stay updated with the latest happenings, announcements, and celebrations across our campuses.
          </p>
        </div>
      </section>

      <section className="container" style={{ padding: "5rem 1rem" }}>
        <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
          {newsItems.map((item, index) => (
            <div key={index} style={{ 
              background: "var(--color-white)", 
              borderRadius: "var(--radius-lg)", 
              overflow: "hidden",
              boxShadow: "var(--shadow-md)",
              transition: "transform 0.3s ease, box-shadow 0.3s ease",
              display: "flex",
              flexDirection: "column"
            }} className="news-card">
              <div style={{ height: "200px", background: `url('${item.img}') center/cover` }}></div>
              <div style={{ padding: "2rem", display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ color: "var(--color-primary-green)", fontSize: "0.85rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "0.5rem" }}>
                  {item.category}
                </span>
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.4rem", marginBottom: "1rem", lineHeight: 1.4 }}>{item.title}</h3>
                <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6, marginBottom: "1.5rem", flex: 1 }}>{item.excerpt}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-gray-100)", paddingTop: "1rem", marginTop: "auto" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-gray-500)", fontSize: "0.9rem" }}>
                    <FiCalendar /> {item.date}
                  </span>
                  <Link href={`/news/${item.slug}`} style={{ textDecoration: "none", color: "var(--color-navy-blue)", display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "bold", padding: 0 }}>
                    Read More <FiArrowRight />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        .news-card:hover {
          transform: translateY(-8px);
          box-shadow: var(--shadow-lg);
        }
      `}</style>
    </div>
  );
}
