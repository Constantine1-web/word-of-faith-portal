"use client";

import { useState } from "react";
import { FiMapPin, FiPhone, FiMail, FiClock, FiSend, FiCheckCircle } from "react-icons/fi";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    setStatus("submitting");
    setTimeout(() => {
      setStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    }, 600);
  };

  return (
    <div>
      {/* Hero Section */}
      <section
        style={{
          background: "var(--bg-dark)",
          padding: "6rem 1rem",
          color: "white",
          textAlign: "center",
          borderBottom: "4px solid var(--color-primary-green)",
        }}
      >
        <div className="container" style={{ maxWidth: "800px" }}>
          <h1
            style={{
              fontSize: "clamp(1.75rem, 5vw, 3.5rem)",
              marginBottom: "1rem",
              color: "white",
            }}
          >
            Contact Us
          </h1>
          <p
            style={{
              fontSize: "clamp(1rem, 3vw, 1.2rem)",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            We would love to hear from you. Reach out to us for admissions, general inquiries, or feedback.
          </p>
        </div>
      </section>

      <section
        className="container"
        style={{ padding: "clamp(2.5rem, 6vw, 5rem) 1rem" }}
      >
        <div
          className="responsive-grid"
          style={{ gap: "clamp(2rem, 5vw, 4rem)", alignItems: "start" }}
        >
          {/* Contact Details & Map */}
          <div>
            <h2
              style={{
                color: "var(--color-navy-blue)",
                fontSize: "2rem",
                marginBottom: "2rem",
              }}
            >
              Get in Touch
            </h2>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                marginBottom: "2.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "1.25rem",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    background: "rgba(34, 197, 94, 0.12)",
                    color: "var(--color-primary-green)",
                    padding: "0.9rem",
                    borderRadius: "50%",
                    fontSize: "1.35rem",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <FiMapPin />
                </div>
                <div>
                  <h4
                    style={{
                      color: "var(--color-navy-blue)",
                      marginBottom: "0.25rem",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                    }}
                  >
                    Campus Address
                  </h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6, margin: 0 }}>
                    No. 14 Enen Afaha Street, off Ikot Ekpene Road / Atiku Abubakar Road<br />
                    Uyo, Akwa Ibom State, Nigeria
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1.25rem",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    background: "rgba(34, 197, 94, 0.12)",
                    color: "var(--color-primary-green)",
                    padding: "0.9rem",
                    borderRadius: "50%",
                    fontSize: "1.35rem",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <FiPhone />
                </div>
                <div>
                  <h4
                    style={{
                      color: "var(--color-navy-blue)",
                      marginBottom: "0.25rem",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                    }}
                  >
                    Phone Lines
                  </h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6, margin: 0 }}>
                    +234 803 000 0000<br />
                    +234 802 000 0000
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1.25rem",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    background: "rgba(34, 197, 94, 0.12)",
                    color: "var(--color-primary-green)",
                    padding: "0.9rem",
                    borderRadius: "50%",
                    fontSize: "1.35rem",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <FiMail />
                </div>
                <div>
                  <h4
                    style={{
                      color: "var(--color-navy-blue)",
                      marginBottom: "0.25rem",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                    }}
                  >
                    Email Inquiries
                  </h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6, margin: 0 }}>
                    contact@wofs.sch.ng<br />
                    admissions@wofs.sch.ng
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1.25rem",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    background: "rgba(34, 197, 94, 0.12)",
                    color: "var(--color-primary-green)",
                    padding: "0.9rem",
                    borderRadius: "50%",
                    fontSize: "1.35rem",
                    display: "flex",
                    flexShrink: 0,
                  }}
                >
                  <FiClock />
                </div>
                <div>
                  <h4
                    style={{
                      color: "var(--color-navy-blue)",
                      marginBottom: "0.25rem",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                    }}
                  >
                    School Administrative Hours
                  </h4>
                  <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6, margin: 0 }}>
                    Monday – Friday: 7:30 AM – 3:30 PM<br />
                    Saturday &amp; Sunday: Closed
                  </p>
                </div>
              </div>
            </div>

            {/* Google Map centered on Uyo, Akwa Ibom State */}
            <div
              style={{
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                boxShadow: "var(--shadow-sm)",
                height: "320px",
                border: "1px solid var(--border-color)",
              }}
            >
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3974.457814728564!2d7.9128!3d5.0377!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x105d57b29a28d9ff%3A0x62071a5c65a4c520!2sUyo%2C%20Akwa%20Ibom!5e0!3m2!1sen!2sng!4v1700000000000!5m2!1sen!2sng"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen={true}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Word of Faith Schools Uyo Campus Location"
              />
            </div>
          </div>

          {/* Contact Form */}
          <div
            style={{
              background: "var(--color-white)",
              padding: "clamp(1.25rem, 4vw, 2.75rem)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--border-color)",
            }}
          >
            <h3
              style={{
                color: "var(--color-navy-blue)",
                fontSize: "clamp(1.3rem, 4vw, 1.75rem)",
                marginBottom: "0.5rem",
              }}
            >
              Send Us a Message
            </h3>
            <p style={{ color: "var(--color-gray-600)", fontSize: "0.95rem", marginBottom: "1.75rem" }}>
              Our administrative and admissions team typically replies within 24 business hours.
            </p>

            {status === "success" && (
              <div
                style={{
                  background: "rgba(34, 197, 94, 0.12)",
                  border: "1px solid #4ade80",
                  borderRadius: "var(--radius-md)",
                  padding: "1rem 1.25rem",
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  color: "#166534",
                }}
              >
                <FiCheckCircle size={22} color="#16a34a" />
                <div>
                  <strong style={{ display: "block" }}>Message Received!</strong>
                  <span style={{ fontSize: "0.9rem" }}>
                    Thank you for reaching out. We will get back to you shortly.
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Pastor / Mrs. John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. parent@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Admissions, Tuition, Transcript, or Inquiries"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Message *</label>
                <textarea
                  className="form-input"
                  placeholder="Type your message or inquiry here..."
                  rows={5}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required
                  style={{ resize: "vertical" }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={status === "submitting"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.6rem",
                  padding: "0.9rem 1.5rem",
                  fontSize: "1.05rem",
                  marginTop: "0.5rem",
                  opacity: status === "submitting" ? 0.7 : 1,
                  cursor: status === "submitting" ? "wait" : "pointer",
                }}
              >
                <FiSend />
                <span>{status === "submitting" ? "Sending Message..." : "Send Message"}</span>
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
