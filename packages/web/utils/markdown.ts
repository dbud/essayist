import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}
