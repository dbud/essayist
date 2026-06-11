import { marked } from "marked";
import { sanitizeHtml } from "./sanitize.ts";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text) as string;
  return sanitizeHtml(rawHtml);
}
