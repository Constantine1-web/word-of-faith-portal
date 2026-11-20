"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  archiveGalleryPhoto,
  getAdminGalleryManagementData,
  publishGalleryPhoto,
} from "@/app/actions/gallery";
import {
  GALLERY_ASSET_PRESETS,
  GALLERY_CATEGORIES,
  GALLERY_SPAN_OPTIONS,
  slugifyGalleryId,
  validateGalleryImageSrc,
  type GalleryPhotoItem,
} from "@/lib/gallery-cms";
import {
  FiImage,
  FiPlus,
  FiUpload,
  FiEdit2,
  FiArchive,
  FiExternalLink,
  FiRefreshCw,
} from "react-icons/fi";

async function compressPhotoFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read selected image file."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Unsupported or corrupted image file."));
      img.onload = () => {
        const maxWidth = 1400;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas rendering unavailable in this browser."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.82);
        resolve(compressed);
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export default function GalleryCmsClient({
  initialPhotos,
  initialError,
}: {
  initialPhotos: GalleryPhotoItem[];
  initialError?: string;
}) {
  const [photos, setPhotos] = useState<GalleryPhotoItem[]>(initialPhotos);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [customId, setCustomId] = useState("");
  const [category, setCategory] = useState<string>("Events");
  const [caption, setCaption] = useState("");
  const [src, setSrc] = useState(GALLERY_ASSET_PRESETS[0].src);
  const [span, setSpan] = useState("col-span-2");
  const [sortOrder, setSortOrder] = useState<number>(initialPhotos.length + 1);

  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    initialError ? { type: "error", text: initialError } : null
  );

  const activePhotos = photos.filter((p) => !p.isArchived);
  const archivedPhotos = photos.filter((p) => p.isArchived);
  const activeCategoryCount = new Set(activePhotos.map((p) => p.category)).size;

  const computedId = customId.trim()
    ? slugifyGalleryId(customId)
    : alt.trim()
    ? slugifyGalleryId(alt)
    : "gallery-photo-id";

  const previewSrc = validateGalleryImageSrc(src);

  const resetForm = (nextOrder?: number) => {
    setEditingId(null);
    setAlt("");
    setCustomId("");
    setCategory("Events");
    setCaption("");
    setSrc(GALLERY_ASSET_PRESETS[0].src);
    setSpan("col-span-2");
    setSortOrder(nextOrder ?? activePhotos.length + 1);
  };

  const refreshPhotos = async () => {
    const res = await getAdminGalleryManagementData();
    if (res.success) {
      setPhotos(res.photos);
    } else if (res.error) {
      setMessage({ type: "error", text: res.error });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage({
        type: "error",
        text: "Only JPEG, PNG, or WEBP photos are supported for Gallery uploads.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image file must be under 10MB before optimization." });
      return;
    }

    setCompressing(true);
    setMessage(null);
    try {
      const optimized = await compressPhotoFileToDataUrl(file);
      if (optimized.length > 1_200_000) {
        setMessage({
          type: "error",
          text: "Compressed photo still exceeds storage size limit. Try a smaller image.",
        });
      } else {
        setSrc(optimized);
        if (!alt.trim()) {
          setAlt(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
        }
        setMessage({
          type: "success",
          text: "Photo optimized and ready for publication below.",
        });
      }
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to process selected photo.",
      });
    } finally {
      setCompressing(false);
    }
  };

  const handleEdit = (photo: GalleryPhotoItem) => {
    setEditingId(photo.id);
    setAlt(photo.alt);
    setCustomId(photo.id);
    setCategory(photo.category || "Events");
    setCaption(photo.caption);
    setSrc(photo.src);
    setSpan(photo.span || "col-span-2");
    setSortOrder(photo.sortOrder || 10);
    setMessage(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await publishGalleryPhoto({
      id: editingId || customId.trim() || undefined,
      alt,
      caption,
      category,
      src,
      span,
      sortOrder: Number(sortOrder) || 10,
    });

    if (res.success) {
      setMessage({
        type: "success",
        text: editingId
          ? `Updated gallery photo "${alt}" on /gallery.`
          : `Published "${alt}" live on the public /gallery showcase.`,
      });
      await refreshPhotos();
      resetForm(photos.length + 2);
    } else {
      setMessage({ type: "error", text: res.error || "Failed to publish gallery photo." });
    }
    setSaving(false);
  };

  const handleArchive = async (photo: GalleryPhotoItem) => {
    const reason = prompt(
      `Enter archive reason for "${photo.alt}" (logged to immutable AuditLog):`,
      "Replaced with newer school event photography"
    );
    if (reason === null) return;

    setBusyId(photo.id);
    setMessage(null);
    const res = await archiveGalleryPhoto(photo.id, reason.trim() || undefined);
    if (res.success) {
      setMessage({
        type: "success",
        text: `Archived "${photo.alt}" from the public /gallery page.`,
      });
      await refreshPhotos();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to archive gallery photo." });
    }
    setBusyId(null);
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
            LIVE GALLERY PHOTOS
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--status-success-text)" }}>
            {activePhotos.length}
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
            ACTIVE CATEGORIES
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--color-navy-blue)" }}>
            {activeCategoryCount}
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
            ARCHIVED PHOTOS
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--color-gray-600)" }}>
            {archivedPhotos.length}
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
            PUBLIC WEBSITE SHOWCASE
          </div>
          <Link
            href="/gallery"
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
            <FiExternalLink /> Open Public /gallery
          </Link>
        </div>
      </div>

      {/* Add / Edit Photo Form */}
      <form
        onSubmit={handlePublish}
        style={{
          background: "var(--color-white)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-gray-200)",
          padding: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "1.12rem",
                color: "var(--color-navy-blue)",
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <FiPlus /> {editingId ? `Edit Photo (${editingId})` : "Add Photo to Public Gallery"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={() => resetForm()}
                className="btn btn-outline"
                style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
              >
                New Photo / Cancel Edit
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Photo Title / Alt Text *
              </label>
              <input
                type="text"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                required
                minLength={3}
                maxLength={140}
                placeholder="e.g., Inter-House Sports 2026 Relay"
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-gray-300)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-gray-300)",
                }}
              >
                {GALLERY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              Caption (Displayed inside lightbox) *
            </label>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              required
              minLength={6}
              maxLength={360}
              placeholder="Describe the event, pupils, or milestone captured in this photo..."
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-gray-300)",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Grid Tile Size
              </label>
              <select
                value={span}
                onChange={(e) => setSpan(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-gray-300)",
                }}
              >
                {GALLERY_SPAN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Built-in School Asset
              </label>
              <select
                value={GALLERY_ASSET_PRESETS.some((p) => p.src === src) ? src : "__custom__"}
                onChange={(e) => {
                  if (e.target.value !== "__custom__") {
                    setSrc(e.target.value);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-gray-300)",
                }}
              >
                {GALLERY_ASSET_PRESETS.map((preset) => (
                  <option key={preset.src} value={preset.src}>
                    {preset.label}
                  </option>
                ))}
                <option value="__custom__">Uploaded Photo or Custom URL</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Order #
              </label>
              <input
                type="number"
                min={1}
                max={999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Math.max(1, Number(e.target.value) || 1))}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-gray-300)",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Upload Photo (Auto-optimized JPEG)
              </label>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.55rem 0.9rem",
                  border: "1px dashed var(--color-navy-blue)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-gray-50)",
                  color: "var(--color-navy-blue)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <FiUpload /> {compressing ? "Optimizing..." : "Choose Image File"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.25rem" }}>
                Or Paste /images Path or HTTPS URL
              </label>
              <input
                type="text"
                value={src.startsWith("data:") ? "" : src}
                onChange={(e) => setSrc(e.target.value)}
                placeholder={
                  src.startsWith("data:")
                    ? "Uploaded compressed photo attached"
                    : "/images/gallery/... or https://..."
                }
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-gray-300)",
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: "0.75rem", color: "var(--color-gray-500)" }}>
            Photo ID: <code>{editingId || computedId}</code>
          </div>

          <button
            type="submit"
            disabled={saving || compressing}
            className="btn btn-primary"
            style={{ justifyContent: "center", padding: "0.75rem 1.25rem", fontWeight: 700 }}
          >
            {saving
              ? "Publishing..."
              : editingId
              ? "Update Gallery Photo"
              : "Publish Photo to /gallery"}
          </button>
        </div>

        {/* Live Tile Preview */}
        <div
          style={{
            background: "var(--color-gray-50)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-gray-200)",
            padding: "1rem",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--color-gray-500)", marginBottom: "0.6rem" }}>
            LIVE GALLERY TILE PREVIEW
          </div>
          <div
            style={{
              position: "relative",
              height: "240px",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "#0a2540",
            }}
          >
            <Image
              src={previewSrc}
              alt={alt || "Gallery preview"}
              fill
              unoptimized
              sizes="420px"
              style={{ objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1,
                background: "linear-gradient(to top, rgba(10,37,64,0.9), transparent 55%)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: "1rem",
                color: "#fff",
              }}
            >
              <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 800, color: "#4ade80" }}>
                {category} • #{sortOrder}
              </span>
              <strong style={{ fontSize: "1.02rem" }}>{alt || "Photo Title"}</strong>
              <span style={{ fontSize: "0.8rem", opacity: 0.9 }}>
                {caption || "Caption preview will appear here inside the photo lightbox."}
              </span>
            </div>
          </div>
        </div>
      </form>

      {/* Catalog Grid */}
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
            <FiImage /> Managed Photo Catalog ({photos.length})
          </h2>

          <button
            type="button"
            onClick={refreshPhotos}
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: "1rem",
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                border: "1px solid var(--color-gray-200)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                background: photo.isArchived ? "var(--color-gray-50)" : "var(--color-white)",
                opacity: photo.isArchived ? 0.72 : 1,
              }}
            >
              <div style={{ position: "relative", height: "160px", background: "#0f172a" }}>
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  unoptimized
                  sizes="340px"
                  style={{ objectFit: "cover" }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: "0.6rem",
                    left: "0.6rem",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "999px",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    background: photo.isArchived
                      ? "var(--status-error-bg)"
                      : "var(--status-success-bg)",
                    color: photo.isArchived
                      ? "var(--status-error-text)"
                      : "var(--status-success-text)",
                  }}
                >
                  {photo.isArchived ? "Archived" : `Live • #${photo.sortOrder}`}
                </span>
                <span
                  style={{
                    position: "absolute",
                    top: "0.6rem",
                    right: "0.6rem",
                    padding: "0.2rem 0.55rem",
                    borderRadius: "999px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    background: "rgba(10, 37, 64, 0.85)",
                    color: "#fff",
                  }}
                >
                  {photo.category}
                </span>
              </div>

              <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.45rem", flex: 1 }}>
                <div style={{ fontWeight: 700, color: "var(--color-navy-blue)", fontSize: "0.98rem" }}>
                  {photo.alt}
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-gray-600)", flex: 1 }}>
                  {photo.caption}
                </p>
                <div style={{ fontSize: "0.74rem", color: "var(--color-gray-500)" }}>
                  Layout: <code>{photo.span || "1x1"}</code> • By {photo.authorEmail || "Editorial"}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => handleEdit(photo)}
                    className="btn btn-outline"
                    style={{
                      padding: "0.35rem 0.7rem",
                      fontSize: "0.78rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <FiEdit2 /> {photo.isArchived ? "Edit / Restore" : "Edit"}
                  </button>

                  {!photo.isArchived && (
                    <button
                      type="button"
                      onClick={() => handleArchive(photo)}
                      disabled={busyId === photo.id}
                      className="btn btn-outline"
                      style={{
                        padding: "0.35rem 0.7rem",
                        fontSize: "0.78rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        color: "var(--status-error-text)",
                      }}
                    >
                      <FiArchive /> {busyId === photo.id ? "Archiving..." : "Archive"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
