"use client";

import { useState } from "react";
import { FiCheckCircle, FiChevronDown, FiChevronUp } from "react-icons/fi";

export default function AdmissionsPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    childFirstName: "",
    childLastName: "",
    dateOfBirth: "",
    gender: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    applyingClass: "",
    previousSchool: ""
  });

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleNext = () => setStep(prev => prev + 1);
  const handlePrev = () => setStep(prev => prev - 1);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || "Submission failed.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const faqs = [
    { question: "What is the age requirement for Nursery?", answer: "Children must be at least 3 years old by September of the admission year to enter Nursery 1." },
    { question: "Are the school fees paid per term or annually?", answer: "School fees are billed per term. However, parents have the option to make an annual payment at a discounted rate." },
    { question: "Is there a boarding facility?", answer: "Yes, we offer premium boarding facilities for Secondary School students (JSS1 - SS3) with excellent pastoral care." },
    { question: "What curriculum does the school run?", answer: "We run a blended curriculum. Nursery uses Montessori, while Primary and Secondary integrate the Nigerian National Curriculum with international standards." }
  ];

  return (
    <div>
      {/* Hero */}
      <section style={{ 
        position: "relative",
        background: "url('https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=1600&auto=format&fit=crop') center/cover",
        padding: "8rem 1rem 6rem",
        color: "white",
        textAlign: "center"
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(rgba(10,37,64,0.85), rgba(10,37,64,0.95))" }}></div>
        <div className="container" style={{ position: "relative", zIndex: 1, maxWidth: "800px" }}>
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1rem", color: "white" }}>Online Admissions</h1>
          <p style={{ fontSize: "1.2rem", color: "rgba(255, 255, 255, 0.9)" }}>
            Begin your child's journey to excellence. Fill out the application form below.
          </p>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="container" style={{ padding: "5rem 1rem" }}>
        <div className="responsive-grid" style={{ gap: "4rem", alignItems: "start" }}>
          
          {/* Multi-Step Form */}
          <div style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" }}>
            <h2 style={{ color: "var(--color-navy-blue)", fontSize: "2rem", marginBottom: "2rem" }}>Admission Application</h2>
            
            {success ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                <FiCheckCircle style={{ color: "var(--color-primary-green)", fontSize: "5rem", margin: "0 auto 1rem" }} />
                <h3 style={{ color: "var(--color-navy-blue)", fontSize: "1.8rem", marginBottom: "1rem" }}>Application Submitted!</h3>
                <p style={{ color: "var(--color-gray-600)", lineHeight: 1.6 }}>
                  Thank you for applying. Your application has been received and is pending review by the admin. We will contact you shortly via email.
                </p>
                <button className="btn btn-primary" style={{ marginTop: "2rem" }} onClick={() => window.location.reload()}>Submit Another</button>
              </div>
            ) : (
              <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
                {/* Progress Bar */}
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ flex: 1, height: "6px", borderRadius: "3px", background: step >= i ? "var(--color-primary-green)" : "var(--color-gray-200)" }}></div>
                  ))}
                </div>

                {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem" }}>{error}</div>}

                {/* Step 1: Student Details */}
                {step === 1 && (
                  <div style={{ animation: "fadeIn 0.5s ease" }}>
                    <h3 style={{ marginBottom: "1.5rem", color: "var(--color-navy-blue)" }}>Step 1: Student Information</h3>
                    <div className="form-group">
                      <label className="form-label">First Name</label>
                      <input type="text" name="childFirstName" className="form-input" value={formData.childFirstName} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Last Name</label>
                      <input type="text" name="childLastName" className="form-input" value={formData.childLastName} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date of Birth</label>
                      <input type="date" name="dateOfBirth" className="form-input" value={formData.dateOfBirth} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gender</label>
                      <select name="gender" className="form-input" value={formData.gender} onChange={handleChange} required>
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2rem" }}>
                      <button type="submit" className="btn btn-primary">Next Step</button>
                    </div>
                  </div>
                )}

                {/* Step 2: Parent/Guardian & Academic Details */}
                {step === 2 && (
                  <div style={{ animation: "fadeIn 0.5s ease" }}>
                    <h3 style={{ marginBottom: "1.5rem", color: "var(--color-navy-blue)" }}>Step 2: Parent & Academic Info</h3>
                    <div className="form-group">
                      <label className="form-label">Parent/Guardian Name</label>
                      <input type="text" name="parentName" className="form-input" value={formData.parentName} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Parent Email</label>
                      <input type="email" name="parentEmail" className="form-input" value={formData.parentEmail} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Parent Phone Number</label>
                      <input type="text" name="parentPhone" className="form-input" value={formData.parentPhone} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Applying For Class</label>
                      <select name="applyingClass" className="form-input" value={formData.applyingClass} onChange={handleChange} required>
                        <option value="">Select Class</option>
                        <option value="Nursery 1">Nursery 1</option>
                        <option value="Primary 1">Primary 1</option>
                        <option value="JSS 1">JSS 1</option>
                        <option value="SS 1">SS 1</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Previous School (Optional)</label>
                      <input type="text" name="previousSchool" className="form-input" value={formData.previousSchool} onChange={handleChange} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
                      <button type="button" className="btn" style={{ background: "var(--color-gray-200)", color: "var(--color-gray-800)" }} onClick={handlePrev}>Back</button>
                      <button type="submit" className="btn btn-primary">Next Step</button>
                    </div>
                  </div>
                )}

                {/* Step 3: Review */}
                {step === 3 && (
                  <div style={{ animation: "fadeIn 0.5s ease" }}>
                    <h3 style={{ marginBottom: "1.5rem", color: "var(--color-navy-blue)" }}>Step 3: Review & Submit</h3>
                    <div style={{ background: "var(--color-gray-50)", padding: "1.5rem", borderRadius: "var(--radius-md)", marginBottom: "2rem" }}>
                      <p><strong>Student:</strong> {formData.childFirstName} {formData.childLastName}</p>
                      <p><strong>Applying For:</strong> {formData.applyingClass}</p>
                      <p><strong>Parent/Guardian:</strong> {formData.parentName}</p>
                      <p><strong>Email:</strong> {formData.parentEmail}</p>
                      <p><strong>Phone:</strong> {formData.parentPhone}</p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
                      <button type="button" className="btn" style={{ background: "var(--color-gray-200)", color: "var(--color-gray-800)" }} onClick={handlePrev} disabled={loading}>Back</button>
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? "Submitting..." : "Submit Application"}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* FAQ Accordion */}
          <div>
            <h2 style={{ color: "var(--color-navy-blue)", fontSize: "2rem", marginBottom: "2rem" }}>Frequently Asked Questions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {faqs.map((faq, index) => (
                <div key={index} style={{ border: "1px solid var(--color-gray-200)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <button 
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    style={{ width: "100%", textAlign: "left", padding: "1.5rem", background: openFaq === index ? "var(--color-gray-50)" : "var(--color-white)", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontWeight: "bold", color: "var(--color-navy-blue)", fontSize: "1.1rem" }}
                  >
                    {faq.question}
                    {openFaq === index ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                  {openFaq === index && (
                    <div style={{ padding: "0 1.5rem 1.5rem", background: "var(--color-gray-50)", color: "var(--color-gray-600)", lineHeight: 1.6, borderTop: "1px solid var(--color-gray-200)", paddingTop: "1rem" }}>
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: "3rem", background: "white", padding: "1.5rem", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--color-primary-green)", boxShadow: "var(--shadow-sm)" }}>
              <h4 style={{ color: "var(--color-navy-blue)", marginBottom: "0.5rem" }}>Need Help?</h4>
              <p style={{ color: "var(--color-gray-600)", fontSize: "0.9rem", margin: 0 }}>Call our admission desk at <strong>+234 800 000 0000</strong> or email <strong>admissions@wof.edu.ng</strong></p>
            </div>
          </div>

        </div>
      </section>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
