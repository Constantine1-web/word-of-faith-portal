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
              We look beyond test scores. Our goal is to nurture the whole child—spirit, body, and mind. We want our students to graduate ready to face the real world with strong Christian convictions, practical skills, and a genuine sense of purpose.
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
              To shape young minds in a supportive, Christ-centered environment. We are focused on raising students who combine academic brilliance with godly character, preparing them to lead by example wherever they go.
            </p>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section style={{ background: "var(--bg-dark)", padding: "5rem 1rem", color: "white" }}>
        <div className="container" style={{ maxWidth: "1000px" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "2.5rem", color: "white", marginBottom: "1rem" }}>What We Stand For</h2>
            <p style={{ color: "var(--color-gray-300)" }}>These five pillars guide everything we do, from the classroom to the playground</p>
          </div>

          <div style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {[
              { title: "Faith", desc: "Christian principles aren't just a subject we teach; they are the foundation of our daily school life." },
              { title: "Knowledge", desc: "We push for deep, practical understanding, going far beyond standard memorization." },
              { title: "Excellence", desc: "We expect the best from our students and staff—in academics, sports, and how we treat one another." },
              { title: "Discipline", desc: "We teach self-respect, personal responsibility, and doing the right thing even when no one is watching." },
              { title: "Creativity", desc: "We encourage hands-on problem solving and entrepreneurial thinking, giving students the freedom to build and create." }
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
