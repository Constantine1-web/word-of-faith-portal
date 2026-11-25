/**
 * Browser- & server-safe HTML escaping utility for printable report/receipt popups and emails.
 */
export function escapeHtml(unsafe: unknown): string {
  const str = String(unsafe ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
