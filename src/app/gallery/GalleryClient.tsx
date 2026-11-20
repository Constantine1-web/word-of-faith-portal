"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { FiX, FiChevronLeft, FiChevronRight, FiMaximize2 } from "react-icons/fi";
import type { GalleryPhotoItem } from "@/lib/gallery-cms";

export default function GalleryClient({
  initialPhotos,
}: {
  initialPhotos: GalleryPhotoItem[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const categories = useMemo(() => {
    const distinct = Array.from(
      new Set(initialPhotos.map((p) => p.category || "Events"))
    );
    return ["All", ...distinct];
  }, [initialPhotos]);

  const filteredPhotos = useMemo(() => {
    if (selectedCategory === "All") return initialPhotos;
    return initialPhotos.filter((p) => (p.category || "Events") === selectedCategory);
  }, [initialPhotos, selectedCategory]);

  const goPrev = useCallback(() => {
    if (filteredPhotos.length === 0) return;
    setSelectedIndex((prev) =>
      prev === null ? null : (prev - 1 + filteredPhotos.length) % filteredPhotos.length
    );
  }, [filteredPhotos.length]);

  const goNext = useCallback(() => {
    if (filteredPhotos.length === 0) return;
    setSelectedIndex((prev) =>
      prev === null ? null : (prev + 1) % filteredPhotos.length
    );
  }, [filteredPhotos.length]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, goPrev, goNext]);

  const activePhoto =
    selectedIndex !== null && filteredPhotos[selectedIndex]
      ? filteredPhotos[selectedIndex]
      : null;

  return (
    <div>
      {/* Hero Section */}
      <section
        style={{
          background: "var(--bg-dark)",
          padding: "5.5rem 1rem 4.5rem",
          color: "white",
          textAlign: "center",
          borderBottom: "4px solid var(--color-primary-green)",
        }}
      >
        <div className="container" style={{ maxWidth: "800px" }}>
          <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 3.5rem)", marginBottom: "1rem", color: "white" }}>
            School Photo Gallery
          </h1>
          <p style={{ fontSize: "clamp(1rem, 3vw, 1.2rem)", color: "rgba(255, 255, 255, 0.9)" }}>
            A glimpse into the vibrant school life, milestones, and celebrations at Word of Faith Schools. Tap any photo to enlarge.
          </p>
        </div>
      </section>

      {/* Category Filters */}
      {categories.length > 2 && (
        <section className="container" style={{ padding: "2rem 1rem 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", justifyContent: "center" }}>
            {categories.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedIndex(null);
                  }}
                  style={{
                    padding: "0.45rem 1rem",
                    borderRadius: "999px",
                    border: active
                      ? "1px solid var(--color-primary-green)"
                      : "1px solid var(--border-primary)",
                    background: active ? "var(--color-primary-green)" : "var(--bg-card)",
                    color: active ? "#ffffff" : "var(--text-primary)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Gallery Grid */}
      <section className="container" style={{ padding: "clamp(2rem, 5vw, 4rem) 1rem clamp(2.5rem, 6vw, 5rem)" }}>
        {filteredPhotos.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              padding: "3rem",
              textAlign: "center",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            No gallery photos available in this category yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",
              gap: "1.5rem",
              gridAutoRows: "300px",
              gridAutoFlow: "dense",
            }}
            className="gallery-grid"
          >
            {filteredPhotos.map((img, index) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`View ${img.alt}`}
                className={`gallery-item ${img.span || ""}`}
                style={{
                  position: "relative",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  boxShadow: "var(--shadow-md)",
                  transition: "transform 0.3s ease, box-shadow 0.3s ease",
                  cursor: "pointer",
                  border: "1px solid var(--border-subtle)",
                  padding: 0,
                  background: "var(--bg-secondary)",
                }}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  unoptimized
                  style={{ objectFit: "cover", transition: "transform 0.5s ease" }}
                  className="gallery-image"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="gallery-overlay">
                  <div style={{ padding: "1.25rem", textAlign: "center", width: "100%" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        color: "#4ade80",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <FiMaximize2 size={13} /> {img.category} • Click to Expand
                    </div>
                    <div style={{ color: "white", fontWeight: "bold", fontSize: "1.1rem" }}>
                      {img.alt}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox Modal */}
      {activePhoto && selectedIndex !== null && (
        <div
          className="portal-modal-overlay"
          style={{ zIndex: 1300, background: "rgba(5, 12, 24, 0.9)" }}
          onClick={() => setSelectedIndex(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "960px",
              width: "100%",
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-primary)",
              overflow: "hidden",
              boxShadow: "var(--shadow-floating)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.85rem 1.25rem",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "var(--text-heading)", fontSize: "1.05rem" }}>
                  {activePhoto.alt}
                </h3>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {activePhoto.category} • Photo {selectedIndex + 1} of {filteredPhotos.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIndex(null)}
                aria-label="Close lightbox"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "8px",
                  width: "36px",
                  height: "36px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <FiX size={18} />
              </button>
            </div>

            <div
              style={{
                position: "relative",
                width: "100%",
                height: "min(68vh, 560px)",
                background: "#07111e",
              }}
            >
              <Image
                src={activePhoto.src}
                alt={activePhoto.alt}
                fill
                unoptimized
                style={{ objectFit: "contain" }}
                sizes="100vw"
              />

              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous photo"
                style={{
                  position: "absolute",
                  left: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(10, 37, 64, 0.85)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "50%",
                  width: "44px",
                  height: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <FiChevronLeft size={22} />
              </button>

              <button
                type="button"
                onClick={goNext}
                aria-label="Next photo"
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(10, 37, 64, 0.85)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "50%",
                  width: "44px",
                  height: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <FiChevronRight size={22} />
              </button>
            </div>

            <div
              style={{
                padding: "0.9rem 1.25rem",
                background: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              {activePhoto.caption}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .gallery-item:hover {
          transform: scale(1.02);
          box-shadow: var(--shadow-lg);
          z-index: 10;
        }
        .gallery-item:hover .gallery-image {
          transform: scale(1.1);
        }
        .gallery-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(10,37,64,0.92), transparent 65%);
          opacity: 0;
          transition: opacity 0.3s ease;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .gallery-item:hover .gallery-overlay,
        .gallery-item:focus-visible .gallery-overlay {
          opacity: 1;
        }

        @media (min-width: 768px) {
          .col-span-2 { grid-column: span 2; }
          .col-span-3 { grid-column: span 3; }
          .col-span-4 { grid-column: span 4; }
          .row-span-2 { grid-row: span 2; }
        }
      `}</style>
    </div>
  );
}
