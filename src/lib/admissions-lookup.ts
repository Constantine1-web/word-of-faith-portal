/**
 * Pure reference formatting & parsing utilities for public admissions tracking.
 */

export function formatAdmissionReference(id: number): string {
  return `WOF-ADM-${String(Math.max(0, Math.trunc(id))).padStart(5, "0")}`;
}

export function parseAdmissionReference(raw?: string | null): number | null {
  const clean = String(raw || "").trim().toUpperCase();
  if (!clean) return null;

  const prefixed = /^WOF-ADM-(\d+)$/.exec(clean);
  if (prefixed) {
    const id = parseInt(prefixed[1], 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  if (/^\d+$/.test(clean)) {
    const id = parseInt(clean, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  return null;
}
