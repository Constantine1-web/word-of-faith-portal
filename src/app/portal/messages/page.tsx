"use client";

import { useState, useEffect, useRef } from "react";
import {
  getMessageContacts,
  getConversation,
  sendMessage,
  sendDirectStudentMessage,
} from "@/app/actions/messaging";
import { FiSend, FiUser, FiMail, FiMessageCircle, FiPhone, FiExternalLink } from "react-icons/fi";

export default function MessagesPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [directSubject, setDirectSubject] = useState("Notice from Word of Faith Schools Portal");
  const [directPhoneOverride, setDirectPhoneOverride] = useState("");
  const [directDispatching, setDirectDispatching] = useState(false);
  const [directFeedback, setDirectFeedback] = useState<{
    type: "success" | "error";
    text: string;
    whatsappDeepLink?: string;
    smsDeepLink?: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadContacts() {
      const res = await getMessageContacts();
      if (res.success) {
        setContacts(res.contacts || []);
      }
      setLoading(false);
    }
    loadContacts();
  }, []);

  const selectedContact = contacts.find((c) => c.UserID === selectedUserId);

  useEffect(() => {
    if (selectedContact?.Student?.ParentContact) {
      setDirectPhoneOverride(selectedContact.Student.ParentContact);
    } else {
      setDirectPhoneOverride("");
    }
    setDirectFeedback(null);
  }, [selectedUserId, selectedContact]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function loadMessages() {
      if (!selectedUserId) return;
      const res = await getConversation(selectedUserId);
      if (res.success) {
        setMessages(res.messages || []);
      }
    }

    loadMessages();
    interval = setInterval(loadMessages, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [selectedUserId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedUserId) return;

    const tempMsg = {
      MessageID: Date.now(),
      Content: input,
      SenderID: -1, // Indicates self, optimistic
      CreatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    const text = input;
    setInput("");

    await sendMessage(selectedUserId, text);
  };

  const handleDirectChannelSend = async (channels: ("EMAIL" | "WHATSAPP" | "SMS")[]) => {
    if (!selectedContact || !input.trim()) {
      setDirectFeedback({
        type: "error",
        text: "Type a message in the box below before dispatching via Email, WhatsApp, or SMS.",
      });
      return;
    }

    setDirectDispatching(true);
    setDirectFeedback(null);

    const res = await sendDirectStudentMessage({
      studentIdentifier: selectedContact.Email,
      phoneOverride: directPhoneOverride.trim() || selectedContact.Student?.ParentContact || undefined,
      subject: directSubject,
      message: input.trim(),
      channels,
    });

    if (res.success) {
      setMessages((prev) => [
        ...prev,
        {
          MessageID: Date.now(),
          Content: `[Direct ${channels.join(" + ")}] ${input.trim()}`,
          SenderID: -1,
          CreatedAt: new Date().toISOString(),
        },
      ]);
      setInput("");
      setDirectFeedback({
        type: "success",
        text: `Direct ${channels.join(", ")} dispatched to ${res.registrationEmail}${res.studentPhone ? ` (${res.studentPhone})` : ""}.`,
        whatsappDeepLink: res.whatsappUrl || undefined,
        smsDeepLink: res.smsUrl || undefined,
      });

      if (channels.includes("WHATSAPP") && res.whatsappUrl && !res.whatsappApiDispatched) {
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      setDirectFeedback({
        type: "error",
        text: res.error || "Failed to dispatch direct message.",
      });
    }

    setDirectDispatching(false);
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading Messaging Hub...</div>;

  return (
    <div className="responsive-flex" style={{ padding: "1.5rem", minHeight: "calc(100vh - 80px)", gap: "1.25rem" }}>
      {/* Contacts Sidebar */}
      <div
        style={{
          flex: 1,
          background: "var(--color-white)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          overflowY: "auto",
          border: "1px solid var(--color-gray-200)",
          maxHeight: "78vh",
        }}
      >
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-gray-200)",
            background: "var(--color-gray-50)",
            position: "sticky",
            top: 0,
            zIndex: 2,
          }}
        >
          <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Contacts Directory</h3>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.8rem", color: "var(--color-gray-500)" }}>
            Select a student or staff account for portal chat or direct Email / WhatsApp / SMS
          </p>
        </div>
        <div>
          {contacts.map((c) => {
            const studentName = c.Student
              ? c.Student.PreferredName ||
                `${c.Student.FirstName || ""} ${c.Student.LastName || ""}`.trim() ||
                c.Student.AdmissionNo
              : null;
            return (
              <button
                key={c.UserID}
                onClick={() => setSelectedUserId(c.UserID)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.95rem 1.25rem",
                  border: "none",
                  background: selectedUserId === c.UserID ? "rgba(59, 130, 246, 0.1)" : "transparent",
                  borderBottom: "1px solid var(--color-gray-100)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.85rem",
                }}
              >
                <div style={{ background: "var(--color-gray-200)", padding: "0.5rem", borderRadius: "50%" }}>
                  <FiUser size={18} color="var(--color-gray-600)" />
                </div>
                <div style={{ overflow: "hidden" }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: "bold",
                      color: "var(--color-navy-blue)",
                      fontSize: "0.92rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {studentName ? `${studentName} (${c.Email})` : c.Email}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-gray-500)" }}>
                    {c.Role?.RoleName}
                    {c.Student?.Class?.ClassName ? ` • ${c.Student.Class.ClassName}` : ""}
                    {c.Student?.ParentContact ? ` • 📱 ${c.Student.ParentContact}` : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Area */}
      <div
        style={{
          flex: 2,
          background: "var(--color-white)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--color-gray-200)",
          minHeight: "65vh",
        }}
      >
        {selectedUserId && selectedContact ? (
          <>
            <div
              style={{
                padding: "1.15rem 1.5rem",
                borderBottom: "1px solid var(--color-gray-200)",
                background: "var(--color-gray-50)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "var(--color-navy-blue)", fontSize: "1.05rem" }}>
                  {selectedContact.Student
                    ? `${selectedContact.Student.FirstName || ""} ${selectedContact.Student.LastName || ""} (${selectedContact.Email})`
                    : `Chat with ${selectedContact.Email}`}
                </h3>
                <div style={{ fontSize: "0.8rem", color: "var(--color-gray-600)", marginTop: "0.2rem" }}>
                  Registration Email: <strong>{selectedContact.Email}</strong>
                  {selectedContact.Student && (
                    <>
                      {" "}
                      • Admission No: <strong>{selectedContact.Student.AdmissionNo}</strong>
                    </>
                  )}
                </div>
              </div>

              {selectedContact.Student && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    className="input-field"
                    type="tel"
                    placeholder="Student WhatsApp/SMS Phone"
                    value={directPhoneOverride}
                    onChange={(e) => setDirectPhoneOverride(e.target.value)}
                    style={{ padding: "0.4rem 0.65rem", fontSize: "0.82rem", width: "175px" }}
                  />
                  <input
                    className="input-field"
                    type="text"
                    placeholder="Email Subject"
                    value={directSubject}
                    onChange={(e) => setDirectSubject(e.target.value)}
                    style={{ padding: "0.4rem 0.65rem", fontSize: "0.82rem", width: "185px" }}
                  />
                </div>
              )}
            </div>

            {directFeedback && (
              <div
                style={{
                  padding: "0.65rem 1.25rem",
                  background: directFeedback.type === "error" ? "#fee2e2" : "#dcfce7",
                  color: directFeedback.type === "error" ? "#b91c1c" : "#15803d",
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <span>{directFeedback.text}</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {directFeedback.whatsappDeepLink && (
                    <a
                      href={directFeedback.whatsappDeepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: "#16a34a",
                        color: "white",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "4px",
                        textDecoration: "none",
                        fontSize: "0.78rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <FiExternalLink /> Open WhatsApp
                    </a>
                  )}
                  {directFeedback.smsDeepLink && (
                    <a
                      href={directFeedback.smsDeepLink}
                      style={{
                        background: "#0284c7",
                        color: "white",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "4px",
                        textDecoration: "none",
                        fontSize: "0.78rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <FiPhone /> Open SMS App
                    </a>
                  )}
                </div>
              </div>
            )}

            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              {messages.map((m) => {
                const isMine = m.SenderID === -1 || m.ReceiverID === selectedUserId;
                return (
                  <div key={m.MessageID} style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                    <div
                      style={{
                        padding: "0.9rem 1.1rem",
                        borderRadius: isMine ? "18px 18px 0 18px" : "18px 18px 18px 0",
                        background: isMine ? "var(--color-primary-green)" : "var(--color-gray-100)",
                        color: isMine ? "white" : "var(--color-gray-800)",
                        boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
                      }}
                    >
                      <p style={{ margin: 0, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{m.Content}</p>
                    </div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--color-gray-400)",
                        marginTop: "0.25rem",
                        textAlign: isMine ? "right" : "left",
                      }}
                    >
                      {new Date(m.CreatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid var(--color-gray-200)", padding: "1rem 1.5rem" }}>
              {selectedContact.Student && (
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--color-gray-600)" }}>
                    Direct Student Dispatch:
                  </span>
                  <button
                    type="button"
                    disabled={directDispatching || !input.trim()}
                    onClick={() => handleDirectChannelSend(["EMAIL"])}
                    className="btn btn-outline"
                    style={{
                      padding: "0.3rem 0.7rem",
                      fontSize: "0.78rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <FiMail /> Send Email ({selectedContact.Email})
                  </button>
                  <button
                    type="button"
                    disabled={directDispatching || !input.trim()}
                    onClick={() => handleDirectChannelSend(["WHATSAPP"])}
                    className="btn btn-outline"
                    style={{
                      padding: "0.3rem 0.7rem",
                      fontSize: "0.78rem",
                      borderColor: "#16a34a",
                      color: "#15803d",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <FiMessageCircle /> Send WhatsApp ({directPhoneOverride || "Phone"})
                  </button>
                  <button
                    type="button"
                    disabled={directDispatching || !input.trim()}
                    onClick={() => handleDirectChannelSend(["SMS"])}
                    className="btn btn-outline"
                    style={{
                      padding: "0.3rem 0.7rem",
                      fontSize: "0.78rem",
                      borderColor: "#0284c7",
                      color: "#0369a1",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <FiPhone /> Send SMS ({directPhoneOverride || "Phone"})
                  </button>
                  <button
                    type="button"
                    disabled={directDispatching || !input.trim()}
                    onClick={() => handleDirectChannelSend(["EMAIL", "WHATSAPP", "SMS"])}
                    className="btn btn-primary"
                    style={{
                      padding: "0.3rem 0.75rem",
                      fontSize: "0.78rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    Dispatch All 3 Channels
                  </button>
                </div>
              )}

              <form onSubmit={handleSend} style={{ display: "flex", gap: "0.75rem" }}>
                <input
                  className="input-field"
                  type="text"
                  placeholder="Type a message for portal chat or direct Email / WhatsApp / SMS..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: "0 1.5rem" }}
                  disabled={!input.trim()}
                  title="Send Portal Message"
                >
                  <FiSend size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-gray-400)",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <FiUser size={64} opacity={0.5} />
            <p>Select a contact to start messaging or send direct Email, WhatsApp, and SMS</p>
          </div>
        )}
      </div>
    </div>
  );
}
