import { defineExtension } from "@lexical/extension";
import { $isMarkNode, type MarkNode } from "@lexical/mark";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { marksAtCursor } from "@/signals/marksAtCursor.ts";

/**
 * Collects the ids of every MarkNode on the ancestor chain of the selection
 * anchor (handles nested/overlapping marks). Runs in a $-context.
 */
function $markIdsAtAnchor(): Set<string> {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return new Set();

  const ids = new Set<string>();
  let node: LexicalNode | null = selection.anchor.getNode();
  while (node !== null) {
    const mark: MarkNode | null = $findMatchingParent(node, $isMarkNode);
    if (mark === null) break;
    for (const id of mark.getIDs()) ids.add(id);
    node = mark.getParent();
  }
  return ids;
}

export const MarksAtCursorExtension = defineExtension({
  name: "marks-at-cursor",
  afterRegistration: (editor: LexicalEditor) => {
    const read = (editorState: EditorState) => {
      editorState.read(() => {
        marksAtCursor.value = $markIdsAtAnchor();
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
      marksAtCursor.value = new Set();
    };
  },
});
