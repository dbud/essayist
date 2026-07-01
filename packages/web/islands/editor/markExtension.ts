import { defineExtension } from "@lexical/extension";
import { $wrapSelectionInMarkNode, MarkNode } from "@lexical/mark";
import { effect } from "@preact/signals";
import {
  $getSelection,
  $setSelection,
  type LexicalEditor,
  mergeRegister,
} from "lexical";
import { useMarks } from "@/signals/marks.ts";
import { openedFiles } from "@/signals/openedFiles.ts";
import { createRangeSelection } from "@/utils/createRangeSelection.ts";

export const MARK_RANGE_TAG = "mark-range";

export const MarksExtension = defineExtension({
  name: "mark",
  nodes: () => [MarkNode],
  register: (editor: LexicalEditor) =>
    mergeRegister(
      editor.registerMutationListener(MarkNode, (nodes, payload) => {
        console.log("MarkNode mutation", nodes, payload);
      }),
      effect(() => {
        const path = openedFiles.selected.value;
        if (!path) return;
        const { ranges } = useMarks(path);
        if (ranges.value.length > 0)
          editor.update(
            () => {
              const selection = $getSelection()?.clone() ?? null;
              ranges.value.forEach(({ mark, range }) => {
                const selection = createRangeSelection(range);
                $wrapSelectionInMarkNode(
                  selection,
                  false, // isBackward
                  mark.thread_id,
                );
              });
              $setSelection(selection);
            },
            { tag: MARK_RANGE_TAG },
          );
      }),
    ),
});
