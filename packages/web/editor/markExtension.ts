import { defineExtension } from "@lexical/extension";
import {
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
  MarkNode,
} from "@lexical/mark";
import { effect, untracked } from "@preact/signals";
import { assert } from "@std/assert/assert";
import {
  $getNodeByKey,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
} from "lexical";
import { useFile } from "@/signals/file.ts";
import { type RangedMark, useMarks } from "@/signals/marks.ts";
import { openedFiles } from "@/signals/openedFiles.ts";
import {
  $createSelection,
  $restoreSelection,
  $saveSelection,
} from "@/utils/selection.ts";

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
        if (ranges.value.length === 0) return;

        // Untracked snapshot (ranges drives the effect): spans describe the
        // caret's tree; markdown is the stable offset space for restore since
        // marks don't change the exported markdown.
        const { preSpans, content } = untracked(() => {
          const file = useFile(path);
          return {
            preSpans: file.textNodeSpans.value,
            content: file.markdown.value,
          };
        });

        editor.update(
          () => {
            const saved = $saveSelection(preSpans);
            $applyMarks(ranges.value, nodeKeys);
            $restoreSelection(saved, content);
          },
          { tag: MARK_RANGE_TAG },
        );
      }),
    );
  },
});

/**
 * Unwraps existing MarkNodes and wraps the current ranges. No selection
 * handling -- the caller saves/restores around it. Runs in a $-context.
 */
function $applyMarks(ranges: RangedMark[], nodeKeys: Set<NodeKey>) {
  const nodes = Array.from(nodeKeys).map((key) => {
    const node = $getNodeByKey(key);
    assert($isMarkNode(node));
    return node;
  });

  nodes.forEach((node) => {
    $unwrapMarkNode(node);
  });

  ranges
    .map(({ mark, range }) => ({
      id: mark.thread_id,
      selection: $createSelection(range),
    }))
    .forEach(({ id, selection }) => {
      $wrapSelectionInMarkNode(selection, false, id);
    });
}
