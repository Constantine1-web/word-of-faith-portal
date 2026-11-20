"use client";

import { useState } from "react";
import {
  getContactInquiries,
  replyToContactInquiry,
  updateContactInquiryStatus,
  type ContactInquiryItem,
} from "@/app/actions/inquiries";
import {
  FiInbox,
  FiMail,
  FiSearch,
  FiSend,
  FiCheckCircle,
  FiClock,
  FiEye,
  FiRefreshCw,
  FiX,
} from "react-icons/fi";

function statusBadgeStyle(status: string) {
  switch (status) {
    case "NEW":
      return {
        bg: "var(--status-warning-bg)",
        color: "var(--status-warning-text)",
        border: "var(--status-warning-border)",
        label: "New / Unread",
      };
    case "IN_REVIEW":
      return {
        bg: "var(--status-info-bg)",
        color: "var(--status-info-text)",
        border: "var(--status-info-border)",
        label: "In Review",
      };
    case "REPLIED":
      return {
        bg: "var(--status-purple-bg)",
        color: "var(--status-purple-text)",
        border: "var(--status-purple-border)",
        label: "Replied",
      };
    default:
      return {
        bg: "var(--status-success-bg)",
        color: "var(--status-success-text)",
        border: "var(--status-success-border)",
        label: "Resolved",
      };
  }
}

export default function InquiriesClient({
  initialInquiries,
  initialSummary,
}: {
  initialInquiries: ContactInquiryItem[];
  initialSummary: {
    total: number;
    newCount: number;
    inReviewCount: number;
    repliedCount: number;
    resolvedCount: number;
  };
}) {
  const [inquiries, setInquiries] = useState<ContactInquiryItem[]>(initialInquiries);
  const [summary, setSummary] = useState(initialSummary);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Reply Modal State
  const [replyTarget, setReplyTarget] = useState<ContactInquiryItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const refresh = async (nextStatus = statusFilter, nextSearch = search) => {
    setLoading(true);
    const res = await getContactInquiries({ status: nextStatus, search: nextSearch });
    if (res.success && res.inquiries) {
      setInquiries(res.inquiries);
      if (res.summary) setSummary(res.summary);
    } else if (!res.success) {
      setFeedback({ type: "error", text: res.error || "Failed to refresh inquiries." });
    }
    setLoading(false);
  };

  const handleStatusChange = async (refCode: string, status: "IN_REVIEW" | "RESOLVED") => {
    setFeedback(null);
    setLoading(true);
    const res = await updateContactInquiryStatus({ referenceCode: refCode, status });
    if (res.success) {
      setFeedback({ type: "success", text: `Inquiry ${refCode} marked as ${status.replace("_", " ")}.` });
      await refresh();
    } else {
      setFeedback({ type: "error", text: res.error || "Failed to update status." });
      setLoading(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyTarget) return;
    setSendingReply(true);
    setFeedback(null);

    const res = await replyToContactInquiry({
      referenceCode: replyTarget.referenceCode,
      recipientEmail: replyTarget.email,
      recipientName: replyTarget.name,
      originalSubject: replyTarget.subject,
      replyMessage: replyText,
    });

    setSendingReply(false);
    if (res.success) {
      setFeedback({
        type: "success",
        text: res.message || `Reply recorded for ${replyTarget.referenceCode}.`,
      });
      setReplyTarget(null);
      setReplyText("");
      await refresh();
    } else {
      setFeedback({ type: "error", text: res.error || "Failed to send reply." });
    }
  };

  return (
    <div>
      {feedback && (
        <div
          style={{
            padding: "0.9rem 1.1rem",
            marginBottom: "1.25rem",
            borderRadius: "var(--radius-md)",
            background:
              feedback.type === "error" ? "var(--status-error-bg)" : "var(--status-success-bg)",
            color:
              feedback.type === "error" ? "var(--status-error-text)" : "var(--status-success-text)",
            border: `1px solid ${
              feedback.type === "error"
                ? "var(--status-error-border)"
                : "var(--status-success-border)"
            }`,
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            <FiX />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="responsive-grid" style={{ marginBottom: "1.75rem" }}>
        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "4px solid var(--color-navy-blue)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Total Inquiries</div>
          <h2 style={{ margin: "0.25rem 0 0", color: "var(--text-heading)" }}>{summary.total}</h2>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "4px solid var(--status-warning-border)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>New / Unread</div>
          <h2 style={{ margin: "0.25rem 0 0", color: "var(--status-warning-text)" }}>
            {summary.newCount}
          </h2>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "4px solid var(--status-purple-border)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Replied</div>
          <h2 style={{ margin: "0.25rem 0 0", color: "var(--status-purple-text)" }}>
            {summary.repliedCount}
          </h2>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "4px solid var(--status-success-border)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Resolved</div>
          <h2 style={{ margin: "0.25rem 0 0", color: "var(--status-success-text)" }}>
            {summary.resolvedCount}
          </h2>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", flex: "1 1 360px" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: "360px" }}>
            <FiSearch
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search reference code, sender, email, subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refresh(statusFilter, search)}
              className="form-input"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>

          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              refresh(e.target.value, search);
            }}
            style={{ width: "auto", minWidth: "160px" }}
          >
            <option value="ALL">All Inquiries</option>
            <option value="NEW">New / Unread</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="REPLIED">Replied</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <button
            type="button"
            onClick={() => refresh(statusFilter, search)}
            className="btn btn-outline"
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <FiRefreshCw /> {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Inquiries List */}
      {inquiries.length === 0 ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            padding: "3rem",
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <FiInbox size={42} style={{ marginBottom: "0.75rem", opacity: 0.6 }} />
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-heading)" }}>
            No website contact inquiries match your filter
          </div>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
            Submissions sent via the public Contact Us page appear here automatically with full audit logging.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {inquiries.map((inq) => {
            const badge = statusBadgeStyle(inq.status);
            return (
              <div
                key={inq.referenceCode}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem 1.4rem",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 800,
                          fontSize: "0.82rem",
                          background: "var(--bg-secondary)",
                          color: "var(--text-heading)",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "6px",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        {inq.referenceCode}
                      </span>
                      <span
                        style={{
                          padding: "0.2rem 0.65rem",
                          borderRadius: "999px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {badge.label}
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <FiClock size={12} /> {new Date(inq.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <h3 style={{ margin: "0.5rem 0 0.2rem", color: "var(--text-heading)", fontSize: "1.08rem" }}>
                      {inq.subject}
                    </h3>
                    <div style={{ fontSize: "0.86rem", color: "var(--text-secondary)" }}>
                      From: <strong>{inq.name}</strong> &bull;{" "}
                      <a href={`mailto:${inq.email}`} style={{ color: "var(--brand-primary)", fontWeight: 600 }}>
                        {inq.email}
                      </a>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTarget(inq);
                        setReplyText(
                          `Thank you for reaching out to Word of Faith Schools regarding "${inq.subject}".\n\n`
                        );
                      }}
                      className="btn btn-primary"
                      style={{
                        padding: "0.45rem 0.85rem",
                        fontSize: "0.82rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <FiMail size={14} /> Reply via Email
                    </button>

                    {inq.status === "NEW" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(inq.referenceCode, "IN_REVIEW")}
                        disabled={loading}
                        className="btn btn-outline"
                        style={{
                          padding: "0.45rem 0.8rem",
                          fontSize: "0.82rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <FiEye size={14} /> Mark In Review
                      </button>
                    )}

                    {inq.status !== "RESOLVED" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(inq.referenceCode, "RESOLVED")}
                        disabled={loading}
                        className="btn btn-outline"
                        style={{
                          padding: "0.45rem 0.8rem",
                          fontSize: "0.82rem",
                          borderColor: "var(--status-success-border)",
                          color: "var(--status-success-text)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <FiCheckCircle size={14} /> Resolve
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.95rem 1rem",
                    whiteSpace: "pre-wrap",
                    fontSize: "0.92rem",
                    lineHeight: 1.55,
                    color: "var(--text-primary)",
                  }}
                >
                  {inq.message}
                </div>

                {inq.history.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.85rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px dashed var(--border-subtle)",
                      display: "grid",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                      Response &amp; Handling Log
                    </div>
                    {inq.history.map((h, i) => (
                      <div key={i} style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        <strong>{h.actorEmail}</strong> ({h.status || h.action}) on{" "}
                        {new Date(h.createdAt).toLocaleString()}
                        {h.note ? `: "${h.note}"` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Email Reply Modal */}
      {replyTarget && (
        <div className="portal-modal-overlay">
          <div className="modal-content portal-modal-card" style={{ maxWidth: "560px", width: "95vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "var(--text-heading)" }}>
                Official Reply — {replyTarget.referenceCode}
              </h3>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
              >
                <FiX size={20} />
              </button>
            </div>

            <div
              style={{
                background: "var(--bg-secondary)",
                padding: "0.75rem 0.9rem",
                borderRadius: "var(--radius-sm)",
                marginBottom: "1rem",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <strong>To:</strong> {replyTarget.name} &lt;{replyTarget.email}&gt;
              </div>
              <div>
                <strong>Subject:</strong> Re: [{replyTarget.referenceCode}] {replyTarget.subject}
              </div>
            </div>

            <form onSubmit={handleSendReply}>
              <div className="form-group">
                <label className="form-label">Official Response Message</label>
                <textarea
                  rows={6}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="form-input"
                  placeholder="Write your official response from the Word of Faith Administrative Office..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingReply}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <FiSend /> {sendingReply ? "Sending Reply..." : "Send Official Email Reply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
