import { defineExtension } from "@lexical/extension";
import {
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
  MarkNode,
} from "@lexical/mark";
import { effect, type Signal, untracked } from "@preact/signals";
import { assert } from "@std/assert/assert";
import {
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  createCommand,
  HISTORIC_TAG,
  type LexicalCommand,
  type LexicalEditor,
  mergeRegister,
  type NodeKey,
} from "lexical";
import type { RangedMark } from "@/signals/marks.ts";
import {
  $createSelection,
  $restoreSelection,
  $saveSelection,
} from "./selection.ts";
import type { TextNodeSpan } from "./textNodeSpans.ts";

export const MARK_RANGE_TAG = "mark-range";

/** Dispatch with a mark's thread id to place the caret at that mark. */
export const SELECT_MARK_COMMAND: LexicalCommand<string> = createCommand();

export interface MarksExtensionConfig {
  path: string;
  ranges: Signal<RangedMark[]>;
  textNodeSpans: Signal<TextNodeSpan[]>;
  markdown: Signal<string>;
}

export const MarksExtension = defineExtension({
  name: "mark",
  nodes: () => [MarkNode],
  // afterRegistration runs after $initialEditorState is committed; the effect's
  // first run is synchronous, so register() would run it against an empty tree.
  afterRegistration: (
    editor: LexicalEditor,
    { path, ranges, textNodeSpans, markdown }: MarksExtensionConfig,
  ) => {
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

      // Jump-to-mark: find the MarkNode by thread id among the tracked keys and
      // place the caret at its start.
      editor.registerCommand(
        SELECT_MARK_COMMAND,
        (threadId: string) => {
          editor.focus();
          editor.update(() => {
            for (const key of nodeKeys) {
              const node = $getNodeByKey(key);
              if (
                node !== null &&
                $isMarkNode(node) &&
                node.getIDs().includes(threadId)
              ) {
                node.selectStart();
                break;
              }
            }
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),

      effect(() => {
        if (!path) return;
        if (ranges.value.length === 0) return;

        // Untracked snapshot (ranges drives the effect): spans describe the
        // caret's tree; markdown is the stable offset space for restore since
        // marks don't change the exported markdown.
        const { preSpans, content } = untracked(() => ({
          preSpans: textNodeSpans.value,
          content: markdown.value,
        }));

        editor.update(
          () => {
            const saved = $saveSelection(preSpans);
            $applyMarks(ranges.value, nodeKeys);
            $restoreSelection(saved, content);
          },
          { tag: [MARK_RANGE_TAG, HISTORIC_TAG] },
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
    .filter(({ mark }) => mark.length > 0)
    .map(({ mark, range }) => ({
      id: mark.thread_id,
      selection: $createSelection(range),
    }))
    .forEach(({ id, selection }) => {
      $wrapSelectionInMarkNode(selection, false, id);
    });
}
