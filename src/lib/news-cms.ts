/**
 * Safe, XSS-resistant helpers for the Public News & Events CMS.
 * Converts plain/Markdown-lite text written by admins into escaped semantic HTML.
 */

export function escapeNewsHtml(input: string): string {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugifyNewsTitle(title: string): string {
  const slug = String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `news-${Date.now()}`;
}

export function validateNewsImageUrl(rawUrl?: string | null): string {
  const url = (rawUrl || "").trim();
  if (!url) return "/images/school-bg.jpg";

  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return url;
    }
  } catch {
    return "/images/school-bg.jpg";
  }

  return "/images/school-bg.jpg";
}

function formatInlineBold(escapedText: string): string {
  return escapedText.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Converts admin-authored text into sanitized semantic HTML (`<h3>`, `<p>`, `<ul><li>`).
 * All user input is HTML-escaped BEFORE formatting markers (`## `, `- `, `**...**`) are converted.
 */
export function formatNewsBodyToSafeHtml(rawBody: string): string {
  const normalized = String(rawBody || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      out.push(`<h4>${formatInlineBold(escapeNewsHtml(trimmed.slice(4).trim()))}</h4>`);
    } else if (trimmed.startsWith("## ")) {
      closeList();
      out.push(`<h3>${formatInlineBold(escapeNewsHtml(trimmed.slice(3).trim()))}</h3>`);
    } else if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const itemText = trimmed.replace(/^[-*•]\s+/, "");
      out.push(`<li>${formatInlineBold(escapeNewsHtml(itemText))}</li>`);
    } else {
      closeList();
      out.push(`<p>${formatInlineBold(escapeNewsHtml(trimmed))}</p>`);
    }
  }

  closeList();
  return out.join("\n");
}
