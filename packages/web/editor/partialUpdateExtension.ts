import { defineExtension, type LexicalEditor, mergeRegister } from "lexical";
import { markdownFold } from "@/utils/incrementalMarkdown.ts";
import {
  charCountFold,
  charCountWithSpacesFold,
  wordCountFold,
} from "@/utils/textStats.ts";

// Keeps the incremental monoid folds warm by recomputing only dirty
// top-level blocks on each editor update.
export const PartialUpdateExtension = defineExtension({
  name: "partial-update",
  config: {},
  afterRegistration: (editor: LexicalEditor) => {
    return mergeRegister(
      editor.registerUpdateListener(
        ({ editorState, prevEditorState, dirtyElements, dirtyLeaves }) => {
          for (const fold of [
            markdownFold,
            wordCountFold,
            charCountFold,
            charCountWithSpacesFold,
          ]) {
            fold.update(
              editorState,
              prevEditorState,
              dirtyElements,
              dirtyLeaves,
            );
          }
        },
      ),
    );
  },
});
