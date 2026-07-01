import { defineExtension } from "@lexical/extension";
import {
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
  MarkNode,
} from "@lexical/mark";
import { effect } from "@preact/signals";
import { assert } from "@std/assert/assert";
import {
  $getNodeByKey,
  $getSelection,
  $setSelection,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
} from "lexical";
import { type RangedMark, useMarks } from "@/signals/marks.ts";
import { openedFiles } from "@/signals/openedFiles.ts";
import { createRangeSelection } from "@/utils/createRangeSelection.ts";

export const MARK_RANGE_TAG = "mark-range";

export const MarksExtension = defineExtension({
  name: "mark",
  nodes: () => [MarkNode],
  register: (editor: LexicalEditor) => {
    const nodeKeys = new Set<NodeKey>();

    return mergeRegister(
      editor.registerMutationListener(
        MarkNode,
        (mutations, { updateTags: _ }) => {
          for (const [key, mutation] of mutations) {
            if (mutation === "created" || mutation === "updated") {
              nodeKeys.add(key);
            } else {
              nodeKeys.delete(key);
            }
          }
        },
      ),

      effect(() => {
        const path = openedFiles.selected.value;
        if (!path) return;
        const { ranges } = useMarks(path);
        if (ranges.value.length > 0) {
          applyMarks(editor, ranges.value, nodeKeys);
        }
      }),
    );
  },
});

function applyMarks(
  editor: LexicalEditor,
  ranges: RangedMark[],
  nodeKeys: Set<NodeKey>,
) {
  editor.update(
    () => {
      const nodes = Array.from(nodeKeys).map((key) => {
        const node = $getNodeByKey(key);
        assert($isMarkNode(node));
        return node;
      });

      const selection = $getSelection()?.clone() ?? null;

      nodes.forEach((node) => {
        $unwrapMarkNode(node);
      });

      ranges
        .map(({ mark, range }) => ({
          id: mark.thread_id,
          selection: createRangeSelection(range),
        }))
        .forEach(({ id, selection }) => {
          $wrapSelectionInMarkNode(selection, false, id);
        });

      $setSelection(selection);
    },
    { tag: MARK_RANGE_TAG },
  );
}
