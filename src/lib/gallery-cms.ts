/**
 * Safe helpers, layout span whitelist, and built-in default items for
 * the Public Photo Gallery CMS (/gallery & /portal/admin/gallery).
 */

export interface GalleryPhotoItem {
  id: string;
  src: string;
  alt: string;
  caption: string;
  category: string;
  span: string;
  sortOrder: number;
  isDefault: boolean;
  isArchived: boolean;
  authorEmail?: string | null;
  updatedAt: string;
}

export const GALLERY_CATEGORIES = [
  "Graduation",
  "Academics",
  "Events",
  "Campus Life",
  "Sports & Co-Curricular",
] as const;

export const ALLOWED_GALLERY_SPANS = [
  "",
  "col-span-2",
  "col-span-3",
  "col-span-4",
  "row-span-2",
  "row-span-2 col-span-2",
  "col-span-4 row-span-2",
] as const;

export const GALLERY_SPAN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Standard Grid Tile (1x1)" },
  { value: "col-span-2", label: "Wide Card (2 Columns)" },
  { value: "row-span-2 col-span-2", label: "Featured Highlight (2x2)" },
  { value: "col-span-4 row-span-2", label: "Hero Showcase Banner (4x2)" },
  { value: "col-span-3", label: "Panorama Strip (3 Columns)" },
  { value: "row-span-2", label: "Tall Portrait (2 Rows)" },
];

export const GALLERY_ASSET_PRESETS: Array<{ label: string; src: string }> = [
  {
    label: "Valedictory Celebration",
    src: "/images/gallery/media__1782453677661.jpg",
  },
  {
    label: "Primary 5 Graduates",
    src: "/images/gallery/media__1782453677817.jpg",
  },
  {
    label: "Nursery Graduation Class",
    src: "/images/gallery/media__1782453677827.jpg",
  },
  {
    label: "Secondary Honor Roll",
    src: "/images/gallery/media__1782453667628.jpg",
  },
  {
    label: "SS 3 Valedictory Portrait",
    src: "/images/gallery/media__1782453743497.jpg",
  },
  {
    label: "Campus Courtyard",
    src: "/images/school-bg.jpg",
  },
  {
    label: "Academics & Science Hall",
    src: "/images/academics-bg.jpg",
  },
  {
    label: "PTA & Assembly Gathering",
    src: "/images/pta-meeting.jpg",
  },
];

const FALLBACK_GALLERY_IMAGE = "/images/gallery/media__1782453677661.jpg";
const MAX_DATA_URI_LENGTH = 1_200_000; // ~900KB decoded JPEG/WebP/PNG cap

export const DEFAULT_GALLERY_PHOTOS: GalleryPhotoItem[] = [
  {
    id: "graduating-students-celebration",
    src: "/images/gallery/media__1782453677661.jpg",
    alt: "Graduating Students Celebration",
    caption: "Annual Valedictory & Graduation Ceremony — Celebrating Academic & Spiritual Growth",
    category: "Graduation",
    span: "row-span-2 col-span-2",
    sortOrder: 1,
    isDefault: true,
    isArchived: false,
    authorEmail: "Word of Faith Editorial",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "primary-school-graduates",
    src: "/images/gallery/media__1782453677817.jpg",
    alt: "Primary School Graduates",
    caption: "Primary 5 Pupils Celebrating Transition to Junior Secondary School",
    category: "Graduation",
    span: "col-span-2",
    sortOrder: 2,
    isDefault: true,
    isArchived: false,
    authorEmail: "Word of Faith Editorial",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "nursery-graduates",
    src: "/images/gallery/media__1782453677827.jpg",
    alt: "Nursery Graduates",
    caption: "Early Years & Montessori Nursery Graduation Class",
    category: "Graduation",
    span: "col-span-2",
    sortOrder: 3,
    isDefault: true,
    isArchived: false,
    authorEmail: "Word of Faith Editorial",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "secondary-school-scholars",
    src: "/images/gallery/media__1782453667628.jpg",
    alt: "Secondary School Scholars",
    caption: "Secondary School Honor Roll & Academic Achievers",
    category: "Academics",
    span: "col-span-2",
    sortOrder: 4,
    isDefault: true,
    isArchived: false,
    authorEmail: "Word of Faith Editorial",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "senior-secondary-graduating-set",
    src: "/images/gallery/media__1782453743497.jpg",
    alt: "Senior Secondary Graduating Set",
    caption: "Senior Secondary (SS 3) Valedictory Portrait — Prepared for WAEC, NECO & Global Impact",
    category: "Graduation",
    span: "col-span-4 row-span-2",
    sortOrder: 5,
    isDefault: true,
    isArchived: false,
    authorEmail: "Word of Faith Editorial",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

export function slugifyGalleryId(input: string): string {
  const slug = String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || `photo-${Date.now()}`;
}

/**
 * Validates gallery image sources. Accepts:
 * - Safe root-relative local asset paths (`/images/...`, never `//...`)
 * - `https://` or `http://` image URLs
 * - Raster image Data URIs (`image/jpeg`, `image/png`, `image/webp` only; explicitly blocks `image/svg+xml` XSS)
 */
export function validateGalleryImageSrc(rawSrc?: string | null): string {
  const src = String(rawSrc || "").trim();
  if (!src) return FALLBACK_GALLERY_IMAGE;

  if (src.startsWith("/") && !src.startsWith("//")) {
    return src.replace(/[\r\n"'<>]/g, "");
  }

  if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-zA-Z0-9+/=]+$/i.test(src)) {
    if (src.length <= MAX_DATA_URI_LENGTH) {
      return src;
    }
    return FALLBACK_GALLERY_IMAGE;
  }

  try {
    const parsed = new URL(src);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return src;
    }
  } catch {
    return FALLBACK_GALLERY_IMAGE;
  }

  return FALLBACK_GALLERY_IMAGE;
}

export function sanitizeGallerySpan(rawSpan?: string | null): string {
  const clean = String(rawSpan || "").trim();
  return (ALLOWED_GALLERY_SPANS as readonly string[]).includes(clean)
    ? clean
    : "col-span-2";
}
