"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getAdminNewsManagementData,
  publishPublicNewsPost,
  archivePublicNewsPost,
  type PublicNewsPostItem,
} from "@/app/actions/news";
import {
  formatNewsBodyToSafeHtml,
  slugifyNewsTitle,
  validateNewsImageUrl,
} from "@/lib/news-cms";
import {
  FiFileText,
  FiPlus,
  FiEdit2,
  FiArchive,
  FiExternalLink,
  FiRefreshCw,
  FiEye,
} from "react-icons/fi";

const COVER_IMAGE_PRESETS = [
  { label: "School Campus Courtyard", value: "/images/school-bg.jpg" },
  { label: "Academics & Science Hall", value: "/images/academics-bg.jpg" },
  { label: "PTA & Assembly Gathering", value: "/images/pta-meeting.jpg" },
  { label: "Campus Hero Aerial View", value: "/images/about-us-hero.jpg" },
  { label: "School Leadership Portrait", value: "/images/administrator.jpg" },
];

const NEWS_CATEGORIES = [
  "Announcements",
  "Events",
  "PTA & Community",
  "Academics",
  "Sports & Co-Curricular",
  "Admissions",
];

function formatDefaultTodayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function htmlToMarkdownLite(html: string): string {
  return String(html || "")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n## $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n### $1\n")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/(p|div|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function NewsCmsClient({
  initialPosts,
  initialError,
}: {
  initialPosts: PublicNewsPostItem[];
  initialError?: string;
}) {
  const [posts, setPosts] = useState<PublicNewsPostItem[]>(initialPosts);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [category, setCategory] = useState("Announcements");
  const [dateLabel, setDateLabel] = useState(formatDefaultTodayLabel);
  const [excerpt, setExcerpt] = useState("");
  const [img, setImg] = useState("/images/school-bg.jpg");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const [saving, setSaving] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    initialError ? { type: "error", text: initialError } : null
  );

  const computedSlug = customSlug.trim()
    ? slugifyNewsTitle(customSlug)
    : title.trim()
    ? slugifyNewsTitle(title)
    : "your-article-slug";

  const activeCount = posts.filter((p) => !p.isArchived).length;
  const archivedCount = posts.filter((p) => p.isArchived).length;

  const resetForm = () => {
    setEditingSlug(null);
    setTitle("");
    setCustomSlug("");
    setCategory("Announcements");
    setDateLabel(formatDefaultTodayLabel());
    setExcerpt("");
    setImg("/images/school-bg.jpg");
    setBody("");
  };

  const refreshPosts = async () => {
    const res = await getAdminNewsManagementData();
    if (res.success) {
      setPosts(res.posts);
    } else if (res.error) {
      setMessage({ type: "error", text: res.error });
    }
  };

  const handleEditPost = (post: PublicNewsPostItem) => {
    setEditingSlug(post.slug);
    setTitle(post.title);
    setCustomSlug(post.slug);
    setCategory(
      NEWS_CATEGORIES.includes(post.category) ? post.category : "Announcements"
    );
    setDateLabel(post.date);
    setExcerpt(post.excerpt);
    setImg(post.img || "/images/school-bg.jpg");
    setBody(post.rawBody?.trim() ? post.rawBody : htmlToMarkdownLite(post.content));
    setMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await publishPublicNewsPost({
      title,
      slug: customSlug.trim() || undefined,
      category,
      dateLabel,
      excerpt,
      img,
      body,
    });

    if (res.success) {
      setMessage({
        type: "success",
        text: `Published "${title}" live at /news/${res.slug}.`,
      });
      resetForm();
      await refreshPosts();
    } else {
      setMessage({
        type: "error",
        text: res.error || "Failed to publish news post.",
      });
    }
    setSaving(false);
  };

  const handleArchive = async (post: PublicNewsPostItem) => {
    const reason = prompt(
      `Enter archive reason for "${post.title}" (logged to immutable AuditLog):`,
      "Superseded by newer school announcement"
    );
    if (reason === null) return;

    setBusySlug(post.slug);
    setMessage(null);
    const res = await archivePublicNewsPost(post.slug, reason.trim() || undefined);
    if (res.success) {
      setMessage({
        type: "success",
        text: `Archived "${post.title}" from the public /news feed.`,
      });
      await refreshPosts();
    } else {
      setMessage({
        type: "error",
        text: res.error || "Failed to archive news post.",
      });
    }
    setBusySlug(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {message && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "var(--radius-md)",
            background:
              message.type === "error"
                ? "var(--status-error-bg)"
                : "var(--status-success-bg)",
            color:
              message.type === "error"
                ? "var(--status-error-text)"
                : "var(--status-success-text)",
            border: `1px solid ${
              message.type === "error"
                ? "var(--status-error-border)"
                : "var(--status-success-border)"
            }`,
            fontWeight: 700,
          }}
        >
          {message.text}
        </div>
      )}

      {/* KPI Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "1rem",
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            LIVE PUBLIC ARTICLES
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--status-success-text)" }}>
            {activeCount}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            ARCHIVED ARTICLES
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--color-gray-600)" }}>
            {archivedCount}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-primary)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            PUBLIC WEBSITE FEED
          </div>
          <Link
            href="/news"
            target="_blank"
            className="btn btn-outline"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              padding: "0.45rem 0.85rem",
              fontSize: "0.85rem",
            }}
          >
            <FiExternalLink /> Open Public /news Page
          </Link>
        </div>
      </div>

      {/* Article Publisher Form */}
      <form
        onSubmit={handlePublish}
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-gray-200)",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.15rem",
              color: "var(--color-navy-blue)",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            <FiPlus /> {editingSlug ? `Edit Article (${editingSlug})` : "Publish New School News / Event"}
          </h2>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="btn btn-outline"
              style={{
                padding: "0.35rem 0.8rem",
                fontSize: "0.82rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <FiEye /> {showPreview ? "Hide Safe Preview" : "Preview Article"}
            </button>
            {editingSlug && (
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-outline"
                style={{ padding: "0.35rem 0.8rem", fontSize: "0.82rem" }}
              >
                New Draft / Cancel Edit
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
            gap: "1rem",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
              Article Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={4}
              maxLength={180}
              placeholder="e.g., 2026/2027 Entrance Examination Schedule"
              style={{
                width: "100%",
                padding: "0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
              URL Slug (Optional — auto-generated if blank)
            </label>
            <input
              type="text"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              maxLength={90}
              placeholder="entrance-examination-schedule-2026"
              style={{
                width: "100%",
                padding: "0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
              }}
            />
            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)", marginTop: "0.25rem" }}>
              Permalink preview: <code>/news/{computedSlug}</code>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
            gap: "1rem",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
              }}
            >
              {NEWS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
              Display Date Label *
            </label>
            <input
              type="text"
              value={dateLabel}
              onChange={(e) => setDateLabel(e.target.value)}
              required
              minLength={3}
              maxLength={60}
              placeholder="e.g., November 19, 2026"
              style={{
                width: "100%",
                padding: "0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
              Cover Image Preset
            </label>
            <select
              value={COVER_IMAGE_PRESETS.some((p) => p.value === img) ? img : "__custom__"}
              onChange={(e) => {
                if (e.target.value !== "__custom__") {
                  setImg(e.target.value);
                }
              }}
              style={{
                width: "100%",
                padding: "0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
              }}
            >
              {COVER_IMAGE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
              <option value="__custom__">Custom Local or HTTPS Image URL</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
              Cover Image Path / URL
            </label>
            <input
              type="text"
              value={img}
              onChange={(e) => setImg(e.target.value)}
              placeholder="/images/school-bg.jpg or https://..."
              style={{
                width: "100%",
                padding: "0.65rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
            Summary Excerpt * (Shown on News Cards, 10–360 chars)
          </label>
          <textarea
            rows={2}
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            required
            minLength={10}
            maxLength={360}
            placeholder="Brief 1-2 sentence summary shown on the main news grid..."
            style={{
              width: "100%",
              padding: "0.65rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-gray-300)",
              resize: "vertical",
            }}
          />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>
              Full Article Body * (Markdown-lite formatting)
            </label>
            <span style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
              Supports <code>## Heading</code>, <code>### Subheading</code>, <code>- Bullet list</code>, and <code>**bold**</code> (HTML tags are safely escaped)
            </span>
          </div>
          <textarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            minLength={15}
            maxLength={10000}
            placeholder={`Write the announcement details here...\n\n## Key Dates & Schedule\n- **Date:** Monday, 12th October 2026\n- **Venue:** Main School Auditorium, Benin City`}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-gray-300)",
              fontFamily: "inherit",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </div>

        {showPreview && (
          <div
            style={{
              border: "1px solid var(--color-gray-200)",
              borderRadius: "var(--radius-md)",
              padding: "1.25rem",
              background: "var(--color-gray-50)",
            }}
          >
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--color-gray-500)", marginBottom: "0.5rem" }}>
              SANITIZED PUBLIC PREVIEW ({validateNewsImageUrl(img)})
            </div>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--color-navy-blue)" }}>
              {title || "Untitled Article"}
            </h3>
            <div
              style={{ lineHeight: 1.7, color: "var(--color-gray-800)" }}
              dangerouslySetInnerHTML={{
                __html: formatNewsBodyToSafeHtml(
                  body || "Start typing article body above to preview safe formatting."
                ),
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{ padding: "0.75rem 1.5rem", fontWeight: 700 }}
          >
            {saving
              ? "Publishing..."
              : editingSlug
              ? "Republish Updated Article"
              : "Publish Article to Website"}
          </button>
        </div>
      </form>

      {/* Catalog Management Table / Cards */}
      <div
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-gray-200)",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.1rem",
              color: "var(--color-navy-blue)",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            <FiFileText /> Managed News & Events Catalog ({posts.length})
          </h2>

          <button
            type="button"
            onClick={refreshPosts}
            className="btn btn-outline"
            style={{
              padding: "0.4rem 0.85rem",
              fontSize: "0.82rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <FiRefreshCw /> Refresh Catalog
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {posts.map((post) => (
            <div
              key={post.slug}
              style={{
                border: "1px solid var(--color-gray-200)",
                borderRadius: "var(--radius-md)",
                padding: "1rem 1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
                background: post.isArchived ? "var(--color-gray-50)" : "var(--color-white)",
                opacity: post.isArchived ? 0.78 : 1,
              }}
            >
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span
                    style={{
                      padding: "0.18rem 0.55rem",
                      borderRadius: "999px",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      background: post.isArchived
                        ? "var(--status-error-bg)"
                        : "var(--status-success-bg)",
                      color: post.isArchived
                        ? "var(--status-error-text)"
                        : "var(--status-success-text)",
                    }}
                  >
                    {post.isArchived ? "Archived" : "Live"}
                  </span>
                  <span
                    style={{
                      padding: "0.18rem 0.55rem",
                      borderRadius: "999px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      background: "var(--color-gray-100)",
                      color: "var(--color-navy-blue)",
                    }}
                  >
                    {post.category}
                  </span>
                  {post.isDefault && (
                    <span style={{ fontSize: "0.72rem", color: "var(--color-gray-500)", fontWeight: 600 }}>
                      Built-in Default
                    </span>
                  )}
                  <span style={{ fontSize: "0.78rem", color: "var(--color-gray-500)" }}>
                    {post.date}
                  </span>
                </div>

                <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", color: "var(--color-navy-blue)" }}>
                  {post.title}
                </h3>
                <p style={{ margin: "0 0 0.25rem 0", fontSize: "0.85rem", color: "var(--color-gray-600)" }}>
                  {post.excerpt}
                </p>
                <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
                  Slug: <code>/news/{post.slug}</code> • Updated by {post.authorEmail || "Editorial"}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {!post.isArchived && (
                  <Link
                    href={`/news/${post.slug}`}
                    target="_blank"
                    className="btn btn-outline"
                    style={{
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.8rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <FiExternalLink /> View Live
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => handleEditPost(post)}
                  className="btn btn-outline"
                  style={{
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.8rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <FiEdit2 /> {post.isArchived ? "Edit / Republish" : "Edit"}
                </button>

                {!post.isArchived && (
                  <button
                    type="button"
                    onClick={() => handleArchive(post)}
                    disabled={busySlug === post.slug}
                    className="btn btn-outline"
                    style={{
                      padding: "0.35rem 0.75rem",
                      fontSize: "0.8rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      color: "var(--status-error-text)",
                    }}
                  >
                    <FiArchive /> {busySlug === post.slug ? "Archiving..." : "Archive"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
