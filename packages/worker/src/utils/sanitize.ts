import DOMPurify from "dompurify";

export function sanitizeHtml(dirty: string): string {
  if (import.meta.env.SSR) return dirty;
  return DOMPurify(window).sanitize(dirty);
}
