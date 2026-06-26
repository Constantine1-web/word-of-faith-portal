import Link from "next/link";
import { FiTarget, FiHeart, FiBookOpen } from "react-icons/fi";

export default function About() {
  return (
    <div>
      {/* Hero Section */}
      <section style={{ 
        position: "relative",
        background: "url('/images/about-us-hero.jpg') center/cover",
        padding: "8rem 1rem 6rem",
        color: "white",
        textAlign: "center"
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(rgba(10,37,64,0.8), rgba(10,37,64,0.9))" }}></div>
        <div className="container" style={{ position: "relative", zIndex: 1, maxWidth: "800px" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1rem", color: "#FFFFFF" }}>About Us</h1>
          <p style={{ fontSize: "1.2rem", color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
            Discover the legacy, vision, and core values that drive educational excellence at Word of Faith Schools.
          </p>
        </div>
      </section>

      <section className="container" style={{ padding: "5rem 1rem" }}>
        <div style={{ display: "grid", gap: "3rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
          {/* Vision Card */}
          <div style={{ 
            background: "var(--color-white)", 
            padding: "3rem 2rem", 
            borderRadius: "var(--radius-lg)", 
            boxShadow: "var(--shadow-lg)",
            borderTop: "4px solid var(--color-primary-green)",
            transition: "transform 0.3s ease"
          }}>
            <div style={{ width: "60px", height: "60px", background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", marginBottom: "1.5rem" }}><FiTarget /></div>
            <h2 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", fontSize: "1.8rem" }}>Our Vision</h2>
            <p style={{ color: "var(--color-gray-600)", lineHeight: 1.8 }}>
              Developing the total child; Nurturing the spirit, body, and soul. We are dedicated to building a legacy of educational excellence and preparing our students to thrive in a dynamic, ever-changing world.
            </p>
          </div>

          {/* Mission Card */}
          <div style={{ 
            background: "var(--color-white)", 
            padding: "3rem 2rem", 
            borderRadius: "var(--radius-lg)", 
            boxShadow: "var(--shadow-lg)",
            borderTop: "4px solid #3b82f6",
            transition: "transform 0.3s ease",
          }}>
            <div style={{ width: "60px", height: "60px", background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", marginBottom: "1.5rem" }}><FiHeart /></div>
            <h2 style={{ color: "var(--color-navy-blue)", marginBottom: "1rem", fontSize: "1.8rem" }}>Our Mission</h2>
            <p style={{ color: "var(--color-gray-600)", lineHeight: 1.8 }}>
              Shaping young minds with faith, knowledge, and strong moral values. We aim to provide a safe, supportive, and faith-filled environment that raises future leaders with godly character and academic brilliance.
            </p>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section style={{ background: "var(--bg-dark)", padding: "5rem 1rem", color: "white" }}>
        <div className="container" style={{ maxWidth: "1000px" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "2.5rem", color: "white", marginBottom: "1rem" }}>Our Core Values</h2>
            <p style={{ color: "var(--color-gray-300)" }}>The pillars that hold up our institution's standards.</p>
          </div>

          <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {[
              { title: "Faith", desc: "Embedding Christian truths and biblical principles in daily learning." },
              { title: "Knowledge", desc: "Driving rigorous academic learning and practical wisdom." },
              { title: "Excellence", desc: "Pursuing top-tier standards in character, sports, and academics." },
              { title: "Discipline", desc: "Cultivating structured behaviors, self-regulation, and moral integrity." },
              { title: "Creativity", desc: "Empowering students to build skills through hands-on entrepreneurship." }
            ].map((v, i) => (
              <div key={i} style={{ 
                background: "rgba(255,255,255,0.05)", 
                padding: "2rem", 
                borderRadius: "var(--radius-md)", 
                borderLeft: "2px solid var(--color-primary-green)" 
              }}>
                <h3 style={{ color: "var(--color-primary-green)", marginBottom: "0.5rem" }}>{v.title}</h3>
                <p style={{ color: "var(--color-gray-300)", lineHeight: 1.6 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
