import DOMPurify from "dompurify";

export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") return dirty;
  return DOMPurify(window).sanitize(dirty);
}
