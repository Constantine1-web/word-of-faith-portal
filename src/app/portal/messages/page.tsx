"use client";

import { useState, useEffect, useRef } from "react";
import { getMessageContacts, getConversation, sendMessage } from "@/app/actions/messaging";
import { FiSend, FiUser } from "react-icons/fi";

export default function MessagesPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
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
      CreatedAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, tempMsg]);
    const text = input;
    setInput("");
    
    await sendMessage(selectedUserId, text);
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading Messaging Hub...</div>;

  return (
    <div className="responsive-flex" style={{ padding: "2rem", height: "calc(100vh - 80px)" }}>
      {/* Contacts Sidebar */}
      <div style={{ flex: 1, background: "var(--color-white)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", overflowY: "auto", border: "1px solid var(--color-gray-200)", maxHeight: "40vh" }}>
        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)", position: "sticky", top: 0 }}>
          <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>Contacts</h3>
        </div>
        <div>
          {contacts.map(c => (
            <button 
              key={c.UserID}
              onClick={() => setSelectedUserId(c.UserID)}
              style={{
                width: "100%", textAlign: "left", padding: "1rem 1.5rem", border: "none",
                background: selectedUserId === c.UserID ? "rgba(59, 130, 246, 0.1)" : "transparent",
                borderBottom: "1px solid var(--color-gray-100)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "1rem"
              }}
            >
              <div style={{ background: "var(--color-gray-200)", padding: "0.5rem", borderRadius: "50%" }}>
                <FiUser size={20} color="var(--color-gray-600)" />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: "bold", color: "var(--color-navy-blue)" }}>{c.Email}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-gray-500)" }}>{c.Role.RoleName}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 2, background: "var(--color-white)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", border: "1px solid var(--color-gray-200)", minHeight: "50vh" }}>
        {selectedUserId ? (
          <>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--color-gray-200)", background: "var(--color-gray-50)" }}>
              <h3 style={{ margin: 0, color: "var(--color-navy-blue)" }}>
                Chat with {contacts.find(c => c.UserID === selectedUserId)?.Email}
              </h3>
            </div>
            
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {messages.map(m => {
                const isMine = m.SenderID === -1 || m.ReceiverID === selectedUserId;
                return (
                  <div key={m.MessageID} style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                    <div style={{ 
                      padding: "1rem", 
                      borderRadius: isMine ? "20px 20px 0 20px" : "20px 20px 20px 0",
                      background: isMine ? "var(--color-primary-green)" : "var(--color-gray-100)",
                      color: isMine ? "white" : "var(--color-gray-800)",
                      boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
                    }}>
                      <p style={{ margin: 0, lineHeight: 1.4 }}>{m.Content}</p>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-gray-400)", marginTop: "0.25rem", textAlign: isMine ? "right" : "left" }}>
                      {new Date(m.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSend} style={{ padding: "1.5rem", borderTop: "1px solid var(--color-gray-200)", display: "flex", gap: "1rem" }}>
              <input 
                className="input-field"
                type="text"
                placeholder="Type a message..."
                value={input}
                onChange={e => setInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: "0 1.5rem" }} disabled={!input.trim()}>
                <FiSend size={20} />
              </button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-gray-400)", flexDirection: "column", gap: "1rem" }}>
            <FiUser size={64} opacity={0.5} />
            <p>Select a contact to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
