import DOMPurify from "dompurify";
import { IS_BROWSER } from "fresh/runtime";

export function sanitizeHtml(dirty: string): string {
  if (!IS_BROWSER) return dirty;
  return DOMPurify(window).sanitize(dirty);
}
