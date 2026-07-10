import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { $getRoot, type EditorState } from "lexical";
import { marked } from "marked";
import { bootstrapEditorExtension } from "@/editor/extension.ts";
import { sanitizeHtml } from "./sanitize.ts";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text) as string;
  return sanitizeHtml(rawHtml);
}

/** Converts markdown to a Lexical editor state via a throwaway bootstrap editor. */
export function markdownToEditorState(content: string): EditorState {
  const editor = buildEditorFromExtensions({
    ...bootstrapEditorExtension,
    $initialEditorState: undefined,
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

export { editorStateToMarkdown } from "./incrementalMarkdown.ts";
