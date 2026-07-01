import { buildEditorFromExtensions } from "@lexical/extension";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
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

/**
 * Converts markdown string to a Lexical editor state using a headless
 * bootstrap editor built from the shared editor extension.
 * The editor is created, used once, and discarded.
 */
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

/**
 * Converts a Lexical editor state to a markdown string.
 * Reads the editor state synchronously via editor.read().
 */
export function editorStateToMarkdown(state: EditorState): string {
  let result = "";
  state.read(() => {
    result = $convertToMarkdownString(TRANSFORMERS, $getRoot());
  });
  return result;
}
