"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  getMessageContacts,
  getConversation,
  sendMessage,
  type StaffMessageContactItem,
} from "@/app/actions/messaging";
import { FiSend, FiUser, FiSearch } from "react-icons/fi";

interface ThreadMessage {
  MessageID: number;
  SenderID: number;
  ReceiverID?: number;
  Content: string;
  CreatedAt: string | Date;
}

export default function MessagesPage() {
  const [contacts, setContacts] = useState<StaffMessageContactItem[]>([]);
  const [viewerGroup, setViewerGroup] = useState<"ADMINISTRATION" | "TEACHERS">("ADMINISTRATION");
  const [groupFilter, setGroupFilter] = useState<"ALL" | "ADMINISTRATION" | "TEACHERS">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    getMessageContacts()
      .then((res) => {
        if (!mounted) return;
        if (res.success) {
          setContacts(res.contacts || []);
          if (res.viewerGroup) setViewerGroup(res.viewerGroup);
        } else if (res.error) {
          setErrorMsg(res.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setErrorMsg("Unable to load staff messaging contacts.");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedContact = contacts.find((c) => c.UserID === selectedUserId) || null;

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((c) => {
      if (groupFilter !== "ALL" && c.staffGroup !== groupFilter) return false;
      if (!q) return true;
      return (
        c.Email.toLowerCase().includes(q) ||
        c.RoleLabel.toLowerCase().includes(q) ||
        c.formMasterClasses.some((cls) => cls.toLowerCase().includes(q)) ||
        c.subjectSummary.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [contacts, groupFilter, searchQuery]);

  useEffect(() => {
    if (!selectedUserId) return;
    let active = true;

    async function loadMessages() {
      if (!selectedUserId) return;
      const res = await getConversation(selectedUserId);
      if (active && res.success && Array.isArray(res.messages)) {
        setMessages(res.messages as ThreadMessage[]);
        setContacts((prev) =>
          prev.map((c) =>
            c.UserID === selectedUserId ? { ...c, unreadCount: 0 } : c
          )
        );
      }
    }

    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !selectedUserId) return;

    setErrorMsg(null);
    const tempMsg: ThreadMessage = {
      MessageID: Date.now(),
      Content: trimmed,
      SenderID: -1,
      ReceiverID: selectedUserId,
      CreatedAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    setInput("");

    const res = await sendMessage(selectedUserId, trimmed);
    if (!res.success) {
      setErrorMsg(res.error || "Failed to send message.");
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-muted)" }}>
        Loading Admin &amp; Teacher Communications...
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ borderBottom: "1px solid var(--border-primary)", paddingBottom: "0.9rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "var(--color-navy-blue)" }}>
          Admin &amp; Teacher Communications
        </h1>
        <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>
          Internal staff correspondence between School Administration, Class Teachers, and Subject Teachers.
        </p>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--status-error-bg)",
            color: "var(--status-error-text)",
            border: "1px solid var(--status-error-border)",
            fontSize: "0.86rem",
            fontWeight: 600,
          }}
        >
          {errorMsg}
        </div>
      )}

      <div className="responsive-flex" style={{ gap: "1.25rem", minHeight: "calc(100vh - 210px)" }}>
        {/* Staff Directory Sidebar */}
        <div
          style={{
            flex: "1 1 320px",
            maxWidth: "420px",
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-primary)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "74vh",
          }}
        >
          <div
            style={{
              padding: "1rem 1.15rem",
              borderBottom: "1px solid var(--border-primary)",
              background: "var(--bg-secondary)",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "1rem", color: "var(--color-navy-blue)" }}>
                Staff Directory ({filteredContacts.length})
              </h2>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700 }}>
                {viewerGroup === "ADMINISTRATION" ? "Admin View" : "Teacher View"}
              </span>
            </div>

            <div style={{ position: "relative" }}>
              <FiSearch
                size={14}
                style={{ position: "absolute", left: "0.65rem", top: "0.62rem", color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search email, role, or class..."
                className="input-field"
                style={{ width: "100%", padding: "0.42rem 0.65rem 0.42rem 1.95rem", fontSize: "0.84rem" }}
              />
            </div>

            <div style={{ display: "flex", gap: "0.4rem" }}>
              {(
                [
                  { id: "ALL", label: "All Staff" },
                  { id: "ADMINISTRATION", label: "Administration" },
                  { id: "TEACHERS", label: "Teachers" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGroupFilter(tab.id)}
                  style={{
                    flex: 1,
                    padding: "0.35rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.76rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "1px solid var(--border-primary)",
                    background:
                      groupFilter === tab.id ? "var(--color-navy-blue)" : "var(--bg-card)",
                    color: groupFilter === tab.id ? "#ffffff" : "var(--text-secondary)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredContacts.length === 0 ? (
              <div style={{ padding: "1.75rem", textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                No matching staff accounts found.
              </div>
            ) : (
              filteredContacts.map((c) => {
                const isSelected = selectedUserId === c.UserID;
                return (
                  <button
                    key={c.UserID}
                    type="button"
                    onClick={() => setSelectedUserId(c.UserID)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "0.85rem 1.1rem",
                      border: "none",
                      background: isSelected ? "var(--bg-secondary)" : "transparent",
                      borderLeft: isSelected
                        ? "3px solid var(--color-primary-green)"
                        : "3px solid transparent",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "0.12rem 0.4rem",
                            borderRadius: "3px",
                            border: "1px solid var(--border-primary)",
                            background:
                              c.staffGroup === "ADMINISTRATION"
                                ? "var(--status-info-bg)"
                                : "var(--status-success-bg)",
                            color:
                              c.staffGroup === "ADMINISTRATION"
                                ? "var(--status-info-text)"
                                : "var(--status-success-text)",
                          }}
                        >
                          {c.RoleLabel}
                        </span>
                        {c.formMasterClasses.length > 0 && (
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600 }}>
                            Class Teacher: {c.formMasterClasses.join(", ")}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: "0.25rem",
                          fontWeight: 700,
                          color: "var(--text-heading)",
                          fontSize: "0.88rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.Email}
                      </div>
                      {c.subjectSummary.length > 0 && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginTop: "0.1rem",
                          }}
                        >
                          {c.subjectSummary.slice(0, 2).join(" · ")}
                        </div>
                      )}
                    </div>

                    {c.unreadCount > 0 && (
                      <span
                        style={{
                          minWidth: "22px",
                          height: "22px",
                          padding: "0 6px",
                          borderRadius: "4px",
                          background: "var(--color-primary-green)",
                          color: "#ffffff",
                          fontSize: "0.74rem",
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread Area */}
        <div
          style={{
            flex: "2 1 420px",
            background: "var(--bg-card)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            border: "1px solid var(--border-primary)",
            minHeight: "62vh",
            maxHeight: "74vh",
          }}
        >
          {selectedUserId && selectedContact ? (
            <>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--border-primary)",
                  background: "var(--bg-secondary)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, color: "var(--color-navy-blue)", fontSize: "1.02rem" }}>
                    {selectedContact.Email}
                  </h3>
                  <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    ({selectedContact.RoleLabel})
                  </span>
                </div>
                {(selectedContact.formMasterClasses.length > 0 ||
                  selectedContact.subjectSummary.length > 0) && (
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {[
                      selectedContact.formMasterClasses.length > 0
                        ? `Class Teacher: ${selectedContact.formMasterClasses.join(", ")}`
                        : null,
                      selectedContact.subjectSummary.length > 0
                        ? `Subjects: ${selectedContact.subjectSummary.slice(0, 3).join(", ")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>

              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                }}
              >
                {messages.length === 0 ? (
                  <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                    No previous messages in this thread. Send an internal staff note below.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.SenderID === -1 || m.ReceiverID === selectedUserId;
                    return (
                      <div
                        key={m.MessageID}
                        style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "75%" }}
                      >
                        <div
                          style={{
                            padding: "0.75rem 1rem",
                            borderRadius: "8px",
                            background: isMine ? "var(--color-navy-blue)" : "var(--bg-secondary)",
                            color: isMine ? "#ffffff" : "var(--text-primary)",
                            border: isMine ? "none" : "1px solid var(--border-primary)",
                          }}
                        >
                          <p style={{ margin: 0, lineHeight: 1.45, whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
                            {m.Content}
                          </p>
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-muted)",
                            marginTop: "0.2rem",
                            textAlign: isMine ? "right" : "left",
                          }}
                        >
                          {new Date(m.CreatedAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={handleSend}
                style={{
                  borderTop: "1px solid var(--border-primary)",
                  padding: "0.9rem 1.25rem",
                  display: "flex",
                  gap: "0.75rem",
                }}
              >
                <input
                  className="input-field"
                  type="text"
                  placeholder={`Message ${selectedContact.RoleLabel} (${selectedContact.Email})...`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: "0 1.25rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  disabled={!input.trim()}
                >
                  <FiSend size={16} /> Send
                </button>
              </form>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                flexDirection: "column",
                gap: "0.75rem",
                padding: "2rem",
                textAlign: "center",
              }}
            >
              <FiUser size={42} opacity={0.45} />
              <p style={{ margin: 0, fontSize: "0.92rem" }}>
                Select an Administrator, Class Teacher, or Subject Teacher from the directory to start or resume a conversation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
