import { $isCodeNode } from "@lexical/code";
import { defineExtension } from "@lexical/extension";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type LexicalEditor,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { type ToolbarState, toolbarState } from "@/signals/toolbar.ts";
import { $getBlockType } from "./blockFormat.ts";

export const ToolbarStateExtension = defineExtension({
  name: "toolbar-state",
  afterRegistration: (editor: LexicalEditor) => {
    const read = (editorState: EditorState) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          toolbarState.value = null;
          return;
        }
        const anchor = selection.anchor.getNode();
        toolbarState.value = {
          block: $getBlockType(),
          bold: selection.hasFormat("bold"),
          italic: selection.hasFormat("italic"),
          strikethrough: selection.hasFormat("strikethrough"),
          code: selection.hasFormat("code"),
          inCodeBlock: $findMatchingParent(anchor, $isCodeNode) !== null,
        } satisfies ToolbarState;
      });
    };

    read(editor.getEditorState());

    const disposers = mergeRegister(
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

    return () => {
      disposers();
      toolbarState.value = null;
    };
  },
});
