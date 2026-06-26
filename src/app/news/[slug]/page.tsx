import { newsItems } from "@/data/news";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiCalendar } from "react-icons/fi";

export async function generateStaticParams() {
  return newsItems.map((item) => ({
    slug: item.slug,
  }));
}

export default async function NewsDetails({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const item = newsItems.find(n => n.slug === resolvedParams.slug);

  if (!item) {
    notFound();
  }

  return (
    <div>
      {/* Hero Section */}
      <section style={{ 
        background: `linear-gradient(rgba(10,37,64,0.8), rgba(10,37,64,0.9)), url('${item.img}') center/cover`,
        padding: "8rem 1rem 6rem",
        color: "white",
        textAlign: "center"
      }}>
        <div className="container" style={{ maxWidth: "800px" }}>
          <span style={{ 
            background: "var(--color-primary-green)", 
            color: "white", 
            padding: "0.5rem 1rem", 
            borderRadius: "20px", 
            fontSize: "0.85rem", 
            fontWeight: "bold", 
            textTransform: "uppercase", 
            letterSpacing: "1px", 
            marginBottom: "1.5rem", 
            display: "inline-block" 
          }}>
            {item.category}
          </span>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", marginBottom: "1rem", color: "white", lineHeight: 1.2 }}>{item.title}</h1>
          <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", color: "rgba(255,255,255,0.8)", fontSize: "1.1rem" }}>
            <FiCalendar /> {item.date}
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="container" style={{ padding: "4rem 1rem", maxWidth: "800px" }}>
        <Link href="/news" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--color-primary-green)", textDecoration: "none", fontWeight: "bold", marginBottom: "2rem" }}>
          <FiArrowLeft /> Back to News
        </Link>
        
        <article className="news-content" style={{ background: "var(--color-white)", padding: "3rem", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)" }} dangerouslySetInnerHTML={{ __html: item.content }} />
      </section>

      <style>{`
        .news-content h3 {
          color: var(--color-navy-blue);
          margin-top: 2rem;
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }
        .news-content p {
          color: var(--color-gray-800);
          line-height: 1.8;
          margin-bottom: 1.5rem;
          font-size: 1.1rem;
        }
        .news-content ul, .news-content ol {
          color: var(--color-gray-800);
          line-height: 1.8;
          margin-bottom: 1.5rem;
          padding-left: 1.5rem;
          font-size: 1.1rem;
        }
        .news-content li {
          margin-bottom: 0.5rem;
        }
        .news-content strong {
          color: var(--color-navy-blue);
        }
      `}</style>
    </div>
  );
}
