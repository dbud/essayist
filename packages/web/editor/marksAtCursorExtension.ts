import { defineExtension } from "@lexical/extension";
import {
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type LexicalEditor,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { defaultEditorSelection } from "@/signals/editorSelection.ts";
import { $markIdsAtAnchor } from "./markNode.ts";
import type { SelectionExtensionConfig } from "./toolbarStateExtension.ts";

export const MarksAtCursorExtension = defineExtension({
  name: "marks-at-cursor",
  config: { selection: defaultEditorSelection },
  afterRegistration: (
    editor: LexicalEditor,
    { selection }: SelectionExtensionConfig,
  ) => {
    // Publish the mark ids at the caret into `selection.markIds`. The active
    // highlighting is rendered by the MarkHighlights overlay, which reads this
    // signal; the <mark> element stays transparent.
    const read = (editorState: EditorState) => {
      editorState.read(() => {
        selection.markIds.value = $markIdsAtAnchor();
      });
    };

    read(editor.getEditorState());

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => read(editorState)),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          read(editor.getEditorState());
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  },
});
