import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { $getRoot, type EditorState } from "lexical";
import { marked } from "marked";
import editorExtension from "@/islands/editor/extension.ts";
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
 * bootstrap editor built from the shared editor extension.
 * The editor is created, used once, and discarded.
 */
export function markdownToEditorState(content: string): EditorState {
  const editor = buildEditorFromExtensions({
    ...editorExtension,
    $initialEditorState: undefined,
    namespace: "bootstrap-markdown",
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
