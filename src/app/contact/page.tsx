"use client";

import { FiMapPin, FiPhone, FiMail, FiClock, FiSend } from "react-icons/fi";
export default function ContactPage() {
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
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1rem", color: "white" }}>Contact Us</h1>
          <p style={{ fontSize: "1.2rem", color: "rgba(255, 255, 255, 0.9)" }}>
            We'd love to hear from you. Reach out to us for admissions, inquiries, or feedback.
          </p>
        </div>
      </section>

      <section className="container" style={{ padding: "5rem 1rem" }}>
        <div className="responsive-grid" style={{ gap: "4rem", alignItems: "start" }}>
          
          {/* Contact Details & Map */}
          <div>
            <h2 style={{ color: "var(--color-navy-blue)", fontSize: "2rem", marginBottom: "2rem" }}>Get in Touch</h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "3rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                <div style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem", display: "flex" }}>
                  <FiMapPin />
                </div>
                <div>
                  <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", fontSize: "1.1rem" }}>Our Location</h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>123 Faith Avenue, Excellence District<br/>Abuja, Nigeria</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                <div style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem", display: "flex" }}>
                  <FiPhone />
                </div>
                <div>
                  <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", fontSize: "1.1rem" }}>Phone Numbers</h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>+234 800 000 0000<br/>+234 801 111 1111</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                <div style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem", display: "flex" }}>
                  <FiMail />
                </div>
                <div>
                  <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", fontSize: "1.1rem" }}>Email Address</h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>info@wof.edu.ng<br/>admissions@wof.edu.ng</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                <div style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--color-primary-green)", padding: "1rem", borderRadius: "50%", fontSize: "1.5rem", display: "flex" }}>
                  <FiClock />
                </div>
                <div>
                  <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "0.25rem", fontSize: "1.1rem" }}>Visiting Hours</h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>Monday - Friday: 8:00 AM - 4:00 PM<br/>Saturday & Sunday: Closed</p>
                </div>
              </div>
            </div>

            {/* Google Map */}
            <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-sm)", height: "300px" }}>
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15856.495202611756!2d7.481232!3d9.0543639!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x104e0b0015555555%3A0x1555555555555555!2sAbuja%2C%20Federal%20Capital%20Territory%2C%20Nigeria!5e0!3m2!1sen!2sng!4v1700000000000!5m2!1sen!2sng" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </div>

          {/* Contact Form */}
          <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)" }}>
            <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.8rem", marginBottom: "1.5rem" }}>Send a Message</h3>
            <form style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="form-input" placeholder="Enter your full name" required />
              </div>
              
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="form-input" placeholder="Enter your email" required />
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <input type="text" className="form-input" placeholder="What is this regarding?" required />
              </div>
              
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-input" placeholder="Type your message here..." rows={6} required style={{ resize: "vertical" }}></textarea>
              </div>

              <button type="button" className="btn btn-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "1rem", fontSize: "1.1rem", marginTop: "1rem" }} onClick={(e) => { e.preventDefault(); alert("Message sent successfully!"); }}>
                <FiSend /> Send Message
              </button>
            </form>
          </div>

        </div>
      </section>
    </div>
  );
}
