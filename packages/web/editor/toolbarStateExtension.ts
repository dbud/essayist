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
import {
  defaultEditorSelection,
  type EditorSelection,
} from "@/signals/editorSelection.ts";
import { $getBlockType } from "./blockFormat.ts";

export interface SelectionExtensionConfig {
  selection: EditorSelection;
}

export const ToolbarStateExtension = defineExtension({
  name: "toolbar-state",
  config: { selection: defaultEditorSelection },
  afterRegistration: (
    editor: LexicalEditor,
    { selection }: SelectionExtensionConfig,
  ) => {
    const read = (editorState: EditorState) => {
      editorState.read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) {
          selection.block.value = "normal";
          selection.bold.value = false;
          selection.italic.value = false;
          selection.strikethrough.value = false;
          selection.code.value = false;
          selection.inCodeBlock.value = false;
          return;
        }
        const anchor = sel.anchor.getNode();
        selection.block.value = $getBlockType();
        selection.bold.value = sel.hasFormat("bold");
        selection.italic.value = sel.hasFormat("italic");
        selection.strikethrough.value = sel.hasFormat("strikethrough");
        selection.code.value = sel.hasFormat("code");
        selection.inCodeBlock.value =
          $findMatchingParent(anchor, $isCodeNode) !== null;
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
