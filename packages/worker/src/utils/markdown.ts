import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { $getRoot, type EditorState } from "lexical";

import { bootstrapEditorExtension } from "#/editor/extension.ts";

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
