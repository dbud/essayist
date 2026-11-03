import { Marked } from "marked";

import { sanitizeHtml } from "./sanitize.ts";

const display = new Marked({ breaks: true, gfm: true });

export default function renderMarkdown(text: string): string {
  const rawHtml = display.parse(text) as string;
  return sanitizeHtml(rawHtml);
}
