import { $getRoot, createEditor, SerializedEditorState } from "lexical";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { marked } from "marked";
import { sanitizeHtml } from "./sanitize.ts";
import { nodes } from "@/islands/editor/nodes.ts";

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
export function markdownToEditorState(content: string): SerializedEditorState {
  const editor = createEditor({
    namespace: `bootstrap-markdown`,
    theme: {},
    nodes,
    onError(error) {
      throw error;
    },
  });

  editor.update(() => {
    $getRoot().clear();
    $convertFromMarkdownString(content, TRANSFORMERS);
  }, { discrete: true });

  return editor.getEditorState().toJSON();
}
