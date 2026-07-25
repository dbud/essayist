import { defineExtension } from "@lexical/extension";
import { $isMarkNode } from "@lexical/mark";
import {
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { defaultEditorSelection } from "@/signals/editorSelection.ts";
import { $markIdsAtAnchor, MarkNode } from "./markNode.ts";
import type { SelectionExtensionConfig } from "./toolbarStateExtension.ts";

export const MarksAtCursorExtension = defineExtension({
  name: "marks-at-cursor",
  config: { selection: defaultEditorSelection },
  afterRegistration: (
    editor: LexicalEditor,
    { selection }: SelectionExtensionConfig,
  ) => {
    // Tracked MarkNode keys, kept in sync by the mutation listener.
    const nodeKeys = new Set<NodeKey>();

    // Toggles `mark-active` on existing MarkNode elements when the caret
    // moves into/out of them. New elements get the class from MarkNode.createDOM.
    const applyActive = (active: Set<string>) => {
      editor.getEditorState().read(() => {
        for (const key of nodeKeys) {
          const node = $getNodeByKey(key);
          if (!$isMarkNode(node)) continue;
          const el = editor.getElementByKey(key);
          if (el === null) continue;
          el.classList.toggle(
            "mark-active",
            node.getIDs().some((id) => active.has(id)),
          );
        }
      });
    };

    const read = (editorState: EditorState) => {
      editorState.read(() => {
        const ids = $markIdsAtAnchor();
        selection.markIds.value = ids;
        applyActive(ids);
      });
    };

    read(editor.getEditorState());

    return mergeRegister(
      editor.registerMutationListener(MarkNode, (mutations) => {
        for (const [key, mutation] of mutations) {
          if (mutation === "destroyed") nodeKeys.delete(key);
          else nodeKeys.add(key);
        }
        applyActive(selection.markIds.value);
      }),

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
