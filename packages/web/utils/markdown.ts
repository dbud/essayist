import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { $getRoot, createEditor, type EditorState } from "lexical";
import { marked } from "marked";
import { nodes } from "@/islands/editor/nodes.ts";
import { sanitizeHtml } from "./sanitize.ts";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text) as string;
  return sanitizeHtml(rawHtml);
}

/**
 * Converts markdown string to a Lexical editor state using a headless
 * bootstrap editor. The editor is created, used once, and discarded.
 */
export function markdownToEditorState(content: string): EditorState {
  const editor = createEditor({
    namespace: `bootstrap-markdown`,
    theme: {},
    nodes,
    onError(error) {
      throw error;
    },
  });

  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(content, TRANSFORMERS);
    },
    { discrete: true },
  );

  return editor.getEditorState();
}
