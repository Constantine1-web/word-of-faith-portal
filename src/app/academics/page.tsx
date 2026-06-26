import { FiBookOpen, FiGlobe, FiAward, FiBriefcase, FiCheckCircle } from "react-icons/fi";

export default function Academics() {
  return (
    <div>
      {/* Hero Section */}
      <section style={{ 
        position: "relative",
        background: "url('/images/academics-bg.jpg') center/cover no-repeat",
        padding: "8rem 1rem 6rem",
        color: "white",
        textAlign: "center"
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(rgba(10,37,64,0.85), rgba(20,83,45,0.9))" }}></div>
        <div className="container" style={{ position: "relative", zIndex: 1, maxWidth: "800px" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1rem", color: "white" }}>Academics & Curriculum</h1>
          <p style={{ fontSize: "1.2rem", color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
            A meticulously crafted curriculum blending National and International standards with deep biblical roots.
          </p>
        </div>
      </section>

      {/* Philosophy Overview */}
      <section className="container" style={{ padding: "5rem 1rem" }}>
        <div style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h2 style={{ color: "var(--color-navy-blue)", fontSize: "2.5rem", marginBottom: "1rem" }}>Our Educational Philosophy</h2>
          <div style={{ width: "80px", height: "4px", background: "var(--color-primary-green)", margin: "0 auto" }}></div>
        </div>

        <div className="responsive-grid" style={{ gap: "2rem" }}>
          <div style={{ background: "var(--color-white)", padding: "2.5rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", transition: "transform 0.3s ease" }} className="hover-lift">
            <div style={{ color: "var(--color-primary-green)", fontSize: "2.5rem", marginBottom: "1rem" }}><FiAward /></div>
            <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.5rem", marginBottom: "1rem" }}>Biblical Integration</h3>
            <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>
              Every subject, from Science to Arts, is built upon a Biblical Standard Based Education. We don't just teach facts; we teach through the lens of faith.
            </p>
          </div>

          <div style={{ background: "var(--color-white)", padding: "2.5rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", transition: "transform 0.3s ease" }} className="hover-lift">
            <div style={{ color: "#f97316", fontSize: "2.5rem", marginBottom: "1rem" }}><FiBriefcase /></div>
            <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.5rem", marginBottom: "1rem" }}>Practical Skill-Building</h3>
            <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>
              We strongly emphasize active entrepreneurship. Through our annual trade fairs and practical workshops, students learn to build, market, and sell real products.
            </p>
          </div>
        </div>
      </section>

      {/* Curriculum Breakdown */}
      <section style={{ background: "var(--color-gray-50)", padding: "5rem 1rem" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ color: "var(--color-navy-blue)", fontSize: "2.5rem", marginBottom: "1rem" }}>Curriculum Breakdown</h2>
            <div style={{ width: "80px", height: "4px", background: "var(--color-primary-green)", margin: "0 auto" }}></div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4rem" }}>
            
            {/* Nursery */}
            <div className="responsive-grid" style={{ gap: "3rem", alignItems: "center" }}>
              <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)" }}>
                <span style={{ color: "var(--color-primary-green)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Early Years</span>
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "2rem", margin: "1rem 0" }}>Creche & Nursery</h3>
                <p style={{ color: "var(--color-gray-600)", lineHeight: 1.8, marginBottom: "1.5rem" }}>
                  Our Creche and Nursery sections utilize the globally proven Montessori Philosophy, emphasizing hands-on, self-paced, and collaborative play in a highly nurturing environment.
                </p>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "var(--color-primary-green)" }} /> Sensorial & Practical Life Exercises</li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "var(--color-primary-green)" }} /> Phonics & Early Literacy</li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "var(--color-primary-green)" }} /> Basic Numeracy & Cultural Studies</li>
                </ul>
              </div>
              <div style={{ height: "400px", background: "url('/images/academics/media__1782455231663.jpg') center/cover", borderRadius: "var(--radius-lg)" }}></div>
            </div>

            {/* Primary */}
            <div className="responsive-grid" style={{ gap: "3rem", alignItems: "center" }}>
              <div style={{ height: "400px", background: "url('/images/academics/media__1782455258837.jpg') center/cover", borderRadius: "var(--radius-lg)", order: 2 }}></div>
              <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", order: 1 }}>
                <span style={{ color: "#3b82f6", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Basic Education</span>
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "2rem", margin: "1rem 0" }}>Primary School</h3>
                <p style={{ color: "var(--color-gray-600)", lineHeight: 1.8, marginBottom: "1.5rem" }}>
                  At the Primary level, we seamlessly blend the Nigerian National Curriculum with International Standards, laying a robust foundation for academic excellence.
                </p>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "#3b82f6" }} /> Advanced Literacy & Numeracy</li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "#3b82f6" }} /> Basic Science & Technology</li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "#3b82f6" }} /> Coding & ICT Introduction</li>
                </ul>
              </div>
            </div>

            {/* Secondary */}
            <div className="responsive-grid" style={{ gap: "3rem", alignItems: "center" }}>
              <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)" }}>
                <span style={{ color: "#a855f7", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>High School</span>
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "2rem", margin: "1rem 0" }}>Secondary School</h3>
                <p style={{ color: "var(--color-gray-600)", lineHeight: 1.8, marginBottom: "1.5rem" }}>
                  Our Secondary School prepares students for global leadership. Senior students are guided into specialized Science, Arts, or Commercial classes to prepare them for WAEC, NECO, and International Exams.
                </p>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "#a855f7" }} /> Comprehensive WAEC/NECO Prep</li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "#a855f7" }} /> STEM & Robotics Laboratories</li>
                  <li style={{ display: "flex", alignItems: "center", gap: "0.8rem", color: "var(--color-gray-800)" }}><FiCheckCircle style={{ color: "#a855f7" }} /> Specialized Art & Humanities Tracking</li>
                </ul>
              </div>
              <div style={{ height: "400px", background: "url('/images/academics/media__1782455266075.jpg') center/cover", borderRadius: "var(--radius-lg)" }}></div>
            </div>

          </div>
        </div>
      </section>

      {/* Extracurriculars */}
      <section className="container" style={{ padding: "5rem 1rem", textAlign: "center" }}>
        <h2 style={{ color: "var(--color-navy-blue)", fontSize: "2.5rem", marginBottom: "1rem" }}>Clubs & Extracurriculars</h2>
        <div style={{ width: "80px", height: "4px", background: "var(--color-primary-green)", margin: "0 auto 3rem" }}></div>
        <p style={{ fontSize: "1.1rem", color: "var(--color-gray-600)", maxWidth: "700px", margin: "0 auto 3rem", lineHeight: 1.6 }}>
          Education goes beyond the four walls of a classroom. Our students engage in diverse activities that foster leadership, teamwork, and creativity.
        </p>
        
        <div className="responsive-grid" style={{ gap: "2rem" }}>
          <div style={{ padding: "2rem", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-lg)" }}>
            <h4 style={{ color: "var(--color-navy-blue)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>JETS Club</h4>
            <p style={{ color: "var(--color-gray-600)" }}>Junior Engineers, Technicians and Scientists.</p>
          </div>
          <div style={{ padding: "2rem", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-lg)" }}>
            <h4 style={{ color: "var(--color-navy-blue)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Press Club</h4>
            <p style={{ color: "var(--color-gray-600)" }}>Fostering journalistic skills and public speaking.</p>
          </div>
          <div style={{ padding: "2rem", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-lg)" }}>
            <h4 style={{ color: "var(--color-navy-blue)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Music & Drama</h4>
            <p style={{ color: "var(--color-gray-600)" }}>Cultivating artistic expression and performance arts.</p>
          </div>
          <div style={{ padding: "2rem", border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-lg)" }}>
            <h4 style={{ color: "var(--color-navy-blue)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Sports Academy</h4>
            <p style={{ color: "var(--color-gray-600)" }}>Athletics, Football, and Basketball training.</p>
          </div>
        </div>
      </section>

      <style>{`
        .hover-lift:hover {
          transform: translateY(-10px);
          box-shadow: var(--shadow-floating);
        }
        @media (max-width: 768px) {
          .responsive-grid > div:nth-child(1) { order: 1; }
          .responsive-grid > div:nth-child(2) { order: 2; }
        }
      `}</style>
    </div>
  );
}
