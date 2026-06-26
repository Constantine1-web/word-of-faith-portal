import Image from "next/image";

export default function GalleryPage() {
  const images = [
    { src: "/images/gallery/media__1782453677661.jpg", alt: "Graduating Students", span: "row-span-2 col-span-2" },
    { src: "/images/gallery/media__1782453677817.jpg", alt: "Primary Graduates", span: "col-span-2" },
    { src: "/images/gallery/media__1782453677827.jpg", alt: "Nursery Graduates", span: "col-span-2" },
    { src: "/images/gallery/media__1782453667628.jpg", alt: "Graduating Students 2", span: "col-span-2" },
    { src: "/images/gallery/media__1782453743497.jpg", alt: "Senior Secondary Graduates", span: "col-span-4 row-span-2" },
  ];

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
          <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1rem", color: "white" }}>Photo Gallery</h1>
          <p style={{ fontSize: "1.2rem", color: "rgba(255, 255, 255, 0.9)" }}>
            A glimpse into the vibrant life, achievements, and celebrations at Word of Faith Schools.
          </p>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="container" style={{ padding: "5rem 1rem" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "1.5rem",
          gridAutoRows: "300px",
          gridAutoFlow: "dense"
        }} className="gallery-grid">
          {images.map((img, index) => (
            <div key={index} className={`gallery-item ${img.span || ""}`} style={{
              position: "relative",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              boxShadow: "var(--shadow-md)",
              transition: "transform 0.3s ease, box-shadow 0.3s ease",
              cursor: "pointer"
            }}>
              <Image 
                src={img.src} 
                alt={img.alt} 
                fill 
                style={{ objectFit: "cover", transition: "transform 0.5s ease" }} 
                className="gallery-image"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
              <div className="gallery-overlay">
                <span style={{ color: "white", fontWeight: "bold", fontSize: "1.2rem", textAlign: "center", padding: "1rem" }}>
                  {img.alt}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

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
          background: linear-gradient(to top, rgba(10,37,64,0.9), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        .gallery-item:hover .gallery-overlay {
          opacity: 1;
        }

        /* Basic responsive span classes for the masonry effect */
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
