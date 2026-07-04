"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import styles from "./page.module.css";
import { FiX, FiArrowRight } from "react-icons/fi";
import { AutoSlider } from "./components/AutoSlider";
import { Counter } from "./components/Counter";
import { WordFadeIn } from "./components/WordFadeIn";

export default function Home() {
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const quotes = [
    {
      text: "If your faith says yes, God cannot say no.",
      author: "Archbishop Benson Idahosa"
    },
    {
      text: "Train up a child in the way he should go: and when he is old, he will not depart from it.",
      author: "Proverbs 22:6"
    },
    {
      text: "The fear of the Lord is the beginning of wisdom, and knowledge of the Holy One is understanding.",
      author: "Proverbs 9:10"
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % quotes.length);
        setFade(true);
      }, 500); // 500ms fade out
    }, 6000); // Change quote every 6 seconds

    return () => clearInterval(interval);
  }, [quotes.length]);

  return (
    <>
      <section className={styles.hero}>
        <div className="bg-glow"></div>
        <motion.div className={styles.heroContent} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5 }}>
          <h1 className={styles.heroTitle}>Welcome to Word of Faith Schools</h1>
          <WordFadeIn 
            className={styles.heroSubtitle} 
            text="We know that choosing the right environment for your child is one of the most important decisions a parent can make. At Word of Faith, we don't just teach the syllabus—we partner with families to raise grounded, capable, and confident children. We are proud to be a safe, faith-filled home for learning." 
          />
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/admissions" className="btn btn-primary" style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}>
                Apply Now <FiArrowRight />
              </Link>
              <Link href="/about" className="btn btn-outline-light" style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}>
                Discover More
              </Link>
            </div>

            {/* Quick Stats to fill out the hero on mobile */}
            <div className={styles.quickStats}>
              <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)", padding: "1rem 1.5rem", borderRadius: "var(--radius-md)", color: "white", flex: "1 1 120px", maxWidth: "200px" }}>
                <h3 style={{ fontSize: "1.5rem", color: "var(--color-primary-green-light)", margin: 0 }}><Counter to={25} suffix="+" /></h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.9, margin: 0 }}>Years Excellence</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)", padding: "1rem 1.5rem", borderRadius: "var(--radius-md)", color: "white", flex: "1 1 120px", maxWidth: "200px" }}>
                <h3 style={{ fontSize: "1.5rem", color: "var(--color-primary-green-light)", margin: 0 }}><Counter to={100} suffix="%" /></h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.9, margin: 0 }}>Pass Rate</p>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)", padding: "1rem 1.5rem", borderRadius: "var(--radius-md)", color: "white", flex: "1 1 120px", maxWidth: "200px" }}>
                <h3 style={{ fontSize: "1.5rem", color: "var(--color-primary-green-light)", margin: 0 }}><Counter to={50} suffix="+" /></h3>
                <p style={{ fontSize: "0.85rem", opacity: 0.9, margin: 0 }}>Expert Staff</p>
              </div>
            </div>
        </motion.div>
      </section>

      {/* Currently Offering Admission Section */}
      <section style={{ background: "var(--color-gray-50)", padding: "4rem 1rem", borderBottom: "1px solid var(--color-gray-200)" }}>
        <motion.div className="container" style={{ textAlign: "center" }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.4 }}>
          <h2 style={{ fontSize: "2rem", color: "var(--color-navy-blue)", marginBottom: "1rem" }}>Currently Offering Admission</h2>
          <p style={{ color: "var(--color-gray-600)", marginBottom: "2.5rem", fontSize: "1.1rem" }}>Join our community for the 2026/2027 Academic Session. Registration is open for the following levels:</p>
          
          <AutoSlider className={styles.mobileSwipeGrid} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", maxWidth: "900px", margin: "0 auto" }} interval={5000}>
            <Link href="/academics#early-years" style={{ textDecoration: "none" }}>
              <div style={{ background: "var(--color-white)", padding: "2rem 1rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", borderTop: "4px solid var(--color-primary-green)", height: "100%", transition: "transform 0.2s ease" }} className="hover-lift">
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.2rem", marginBottom: "0.5rem" }}>Creche & Nursery</h3>
                <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem" }}>Ages 11 months - 5 years</p>
              </div>
            </Link>
            <Link href="/academics#early-years" style={{ textDecoration: "none" }}>
              <div style={{ background: "var(--color-white)", padding: "2rem 1rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", borderTop: "4px solid #3b82f6", height: "100%", transition: "transform 0.2s ease" }} className="hover-lift">
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.2rem", marginBottom: "0.5rem" }}>Primary</h3>
                <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem" }}>Basic 1 - Basic 5</p>
              </div>
            </Link>
            <Link href="/academics#high-school" style={{ textDecoration: "none" }}>
              <div style={{ background: "var(--color-white)", padding: "2rem 1rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", borderTop: "4px solid #a855f7", height: "100%", transition: "transform 0.2s ease" }} className="hover-lift">
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.2rem", marginBottom: "0.5rem" }}>Junior Secondary</h3>
                <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem" }}>JSS 1 - JSS 3</p>
              </div>
            </Link>
            <Link href="/academics#high-school" style={{ textDecoration: "none" }}>
              <div style={{ background: "var(--color-white)", padding: "2rem 1rem", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", borderTop: "4px solid #f97316", height: "100%", transition: "transform 0.2s ease" }} className="hover-lift">
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.2rem", marginBottom: "0.5rem" }}>Senior Secondary</h3>
                <p style={{ color: "var(--color-gray-500)", fontSize: "0.9rem" }}>SS 1 - SS 2 (No SS3 Intake)</p>
              </div>
            </Link>
          </AutoSlider>
          
          <div style={{ marginTop: "2.5rem" }}>
            <Link href="/admissions" className="btn btn-primary" style={{ padding: "0.75rem 2rem" }}>View Admission Requirements</Link>
          </div>
        </motion.div>
      </section>

      <section className={styles.principalSection}>
        <motion.div className={`container ${styles.principalContent}`} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.4 }}>
          <div className={styles.principalText}>
            <h2 style={{ fontSize: "2.5rem", color: "var(--color-navy-blue)", marginBottom: "1.5rem" }}>Welcome from the Administrator</h2>
            <p style={{ fontSize: "1.1rem", lineHeight: "1.8", color: "var(--color-gray-800)", marginBottom: "1.5rem" }}>
              Welcome to Word of Faith Schools. We are dedicated to providing a safe, supportive, and faith-filled environment where every child can discover their God-given potential. Our comprehensive curriculum blends rigorous academics with strong moral values to shape the leaders of tomorrow.
            </p>
            <p style={{ fontSize: "1.1rem", lineHeight: "1.8", color: "var(--color-gray-800)" }}>
              Whether your child is taking their first steps in our Montessori Creche or preparing for external exams in Secondary school, we are committed to excellence at every stage.
            </p>
            <Link href="/about" className="btn btn-outline" style={{ marginTop: "2rem", display: "inline-block" }}>
              Learn More About Us
            </Link>
          </div>
          <div style={{ 
            flex: 1, 
            minWidth: "min(100%, 300px)", 
            aspectRatio: "3/4", /* Ensures portrait shape is maintained on mobile */
            background: "url('/images/administrator.jpg') top center / cover no-repeat", 
            borderRadius: "var(--radius-lg)", 
            boxShadow: "var(--shadow-md)" 
          }}>
          </div>
        </motion.div>
      </section>

      <section className={styles.eventsSection}>
        <motion.div className="container" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.4 }}>
          <h2 style={{ textAlign: "center", fontSize: "2.5rem", color: "var(--color-navy-blue)", marginBottom: "3rem" }}>Upcoming Events</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "800px", margin: "0 auto" }}>
            <div className={styles.eventCard}>
              <div className={styles.eventDate}>
                <div style={{ fontWeight: "bold", fontSize: "1.2rem", color: "var(--color-primary-green)" }}>AUG</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "900" }}>15</div>
              </div>
              <div>
                <h3 style={{ marginBottom: "0.5rem" }}>Resumption for 2026/2027 Session</h3>
                <p style={{ color: "var(--color-gray-800)" }}>All returning and new students are expected to resume for the First Term of the 2026/2027 academic session.</p>
              </div>
            </div>
            <div className={styles.eventCard}>
              <div className={styles.eventDate}>
                <div style={{ fontWeight: "bold", fontSize: "1.2rem", color: "var(--color-primary-green)" }}>SEP</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "900" }}>04</div>
              </div>
              <div>
                <h3 style={{ marginBottom: "0.5rem" }}>PTA General Meeting</h3>
                <p style={{ color: "var(--color-gray-800)" }}>Interactive session between parents and the school management. Attendance is mandatory.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="container">
        <motion.div className={styles.features} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.4 }}>
          <h2 style={{ textAlign: "center", fontSize: "2.5rem", color: "var(--color-navy-blue)" }}>Our Core Focus</h2>
          <AutoSlider className={`${styles.featuresGrid} ${styles.mobileSwipeGrid}`} interval={5000}>
            <div className={styles.featureCard}>
              <h3 className={styles.featureTitle}>Montessori Foundations</h3>
              <p>Creche and Nursery utilize the Montessori Philosophy for hands-on, self-paced learning in a nurturing environment.</p>
            </div>
            <div className={styles.featureCard}>
              <h3 className={styles.featureTitle}>National Curriculum Sync</h3>
              <p>Primary and Secondary levels blend the Nigerian National Curriculum with International Standards.</p>
            </div>
            <div className={styles.featureCard}>
              <h3 className={styles.featureTitle}>Biblical Integration</h3>
              <p>All subjects are built on a Biblical Standard Based Education, shaping young minds with faith and strong values.</p>
            </div>
          </AutoSlider>
        </motion.div>
      </section>

      <section className={styles.quotesSection}>
        <div className="container">
          <h2 style={{ textAlign: "center", fontSize: "2.5rem", color: "var(--color-navy-blue)", marginBottom: "2rem" }}>Inspiration for Greatness</h2>
          <div className={styles.slideshowContainer}>
            <div className={`${styles.flashcard} ${fade ? styles.fadeIn : styles.fadeOut}`}>
              <p className={styles.quoteText}>{quotes[currentIndex].text}</p>
              <p className={styles.quoteAuthor}>— {quotes[currentIndex].author}</p>
            </div>
            
            <div className={styles.slideshowDots}>
              {quotes.map((_, idx) => (
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
      </section>

      {showAnnouncement && (
        <div className={styles.floatingAnnouncement}>
          <button 
            className={styles.closeAnnouncement} 
            onClick={() => setShowAnnouncement(false)}
            aria-label="Close"
          >
            <FiX />
          </button>
          <span className={styles.announcementTitle}>Important Update</span>
          <span>Admission for the 2026/2027 Academic Session is ongoing! Secure your spot today.</span>
        </div>
      )}
    </>
  );
}
