import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import {
  $isMarkNode,
  $unwrapMarkNode,
  $wrapSelectionInMarkNode,
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
import { $createMarkNode, MarkNode } from "./markNode.ts";
import { type MarkSpan, segmentMarks } from "./markSegments.ts";
import { registerNodeKeyTracker } from "./nodeKeyTracker.ts";
import {
  $createSelection,
  $restoreSelection,
  $saveSelection,
} from "./selection.ts";
import {
  $collectTextNodeSpans,
  findRange,
  type TextNodeSpan,
} from "./textNodeSpans.ts";

export const MARK_RANGE_TAG = "mark-range";

/** Dispatch with a mark's thread id to place the caret at that mark. */
export const SELECT_MARK_COMMAND: LexicalCommand<string> = createCommand();

export interface MarksExtensionConfig {
  path: string;
  resolved: Signal<Mark[]>;
  markdown: Signal<string>;
}

export const MarksExtension = defineExtension({
  name: "mark",
  nodes: () => [MarkNode],
  // afterRegistration runs after $initialEditorState is committed; the effect's
  // first run is synchronous, so register() would run it against an empty tree.
  afterRegistration: (
    editor: LexicalEditor,
    { path, resolved, markdown }: MarksExtensionConfig,
  ) => {
    const nodeKeys = new Set<NodeKey>();

    return mergeRegister(
      registerNodeKeyTracker(editor, MarkNode, nodeKeys),

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
        const marks = resolved.value;
        // Skip only when there's nothing to do: no marks to wrap and no
        // existing MarkNodes to unwrap.
        if (marks.length === 0 && nodeKeys.size === 0) return;

        // `resolved` drives the effect (it re-emits on mark resolution and on
        // edits, debounced by the worker). `markdown` is read untracked: it's
        // the stable offset space for save/restore, since marks don't change
        // the exported markdown.
        const content = untracked(() => markdown.value);

        editor.update(
          () => {
            // One fresh span collection from the in-flight tree, shared with
            // $applyMarks (unwrap preserves keys/text/order, so it stays valid
            // post-unwrap).
            const spans = $collectTextNodeSpans(content);
            const saved = $saveSelection(spans);
            $applyMarks(marks, nodeKeys, spans);
            $restoreSelection(saved, content);
          },
          { tag: [MARK_RANGE_TAG, HISTORIC_TAG] },
        );
      }),
    );
  },
});

/**
 * Unwraps existing MarkNodes and wraps the given mark spans as non-overlapping
 * multi-id segments. `spans` is collected once by the caller from the in-flight
 * tree before unwrapping (unwrap preserves keys/text/order, so the same span
 * list is valid post-unwrap). Segments are wrapped right-to-left: each wrap
 * splits text nodes but keeps the original key on the left portion, so
 * leftward (not-yet-processed) segments' pre-resolved (key, offset) references
 * stay valid -- no re-collection per wrap. Runs in a $-context; no selection
 * handling (the caller saves/restores around it).
 */
export function $applyMarks(
  marks: ReadonlyArray<MarkSpan>,
  nodeKeys: Set<NodeKey>,
  spans: TextNodeSpan[],
): void {
  for (const key of nodeKeys) {
    const node = $getNodeByKey(key);
    assert($isMarkNode(node));
    $unwrapMarkNode(node);
  }

  // No text nodes -> nothing to wrap (e.g. empty document).
  if (spans.length === 0) return;

  const segments = segmentMarks(marks);
  if (segments.length === 0) return;

  // Resolve every segment against the single span list up front. Right-to-left
  // wrapping (below) keeps these references valid; see the header comment.
  const resolved = segments
    .map((seg) => ({
      seg,
      range: findRange(spans, { offset: seg.offset, length: seg.length }),
    }))
    .reverse();

  for (const { seg, range } of resolved) {
    const selection = $createSelection(range);
    // $wrapSelectionInMarkNode always invokes createNode with [id] (the single
    // id argument); ignore that and close over the segment's full id-set so a
    // shared interval becomes one MarkNode carrying every covering mark's id.
    $wrapSelectionInMarkNode(selection, false, seg.ids[0], () =>
      $createMarkNode(seg.ids),
    );
  }
}
