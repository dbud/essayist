import { defineExtension, type LexicalEditor, mergeRegister } from "lexical";
import { cacheMarkdownUpdate } from "@/utils/incrementalMarkdown.ts";

// Keeps the incremental markdown cache warm by re-serializing only dirty
// top-level blocks on each editor update.
export const PartialUpdateExtension = defineExtension({
  name: "partial-update",
  config: {},
  afterRegistration: (editor: LexicalEditor) => {
    return mergeRegister(
      editor.registerUpdateListener(
        ({ editorState, prevEditorState, dirtyElements, dirtyLeaves }) => {
          cacheMarkdownUpdate(
            editorState,
            prevEditorState,
            dirtyElements,
            dirtyLeaves,
          );
        },
      ),
    );
  },
});
