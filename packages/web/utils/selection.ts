import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  type RangeSelection,
} from "lexical";
import {
  $collectTextNodeSpans,
  findPosition,
  type NodeRange,
  positionToOffset,
  type TextNodeSpan,
} from "@/utils/textNodeMapping.ts";

/**
 * Creates a Lexical RangeSelection from a NodeRange, preserving direction
 * (anchor then focus). Must run inside a reactive/update ($-) context.
 */
export function $createSelection(range: NodeRange): RangeSelection {
  const selection = $createRangeSelection();
  selection.anchor.set(range.anchor.key, range.anchor.offset, "text");
  selection.focus.set(range.focus.key, range.focus.offset, "text");
  return selection;
}

/**
 * Saved selection captured before a mutation that may reshuffle TextNodes
 * (e.g. wrapping a range in a MarkNode).
 *
 * - `selection`: clone of the original, used as a fallback.
 * - `anchor`/`focus`: absolute markdown offsets, null for non-text endpoints.
 */
export interface SavedSelection {
  selection: BaseSelection | null;
  anchor: number | null;
  focus: number | null;
}

/**
 * Captures the current selection as a clone plus absolute markdown offsets.
 * Runs in a $-context.
 */
export function $saveSelection(spans: TextNodeSpan[]): SavedSelection {
  const selection = $getSelection();
  if (selection === null) {
    return { selection: null, anchor: null, focus: null };
  }

  const clone = selection.clone();
  if (!$isRangeSelection(selection)) {
    return { selection: clone, anchor: null, focus: null };
  }

  const anchor =
    selection.anchor.type === "text"
      ? positionToOffset(spans, {
          key: selection.anchor.key,
          offset: selection.anchor.offset,
        })
      : null;
  const focus =
    selection.focus.type === "text"
      ? positionToOffset(spans, {
          key: selection.focus.key,
          offset: selection.focus.offset,
        })
      : null;

  return { selection: clone, anchor, focus };
}

/**
 * Restores a selection saved by `$saveSelection` after a mutation. Runs in a
 * $-context, in the same update that performed the mutation.
 *
 * Re-resolves the saved offsets against the post-mutation tree by walking
 * `$getRoot()` (the in-flight state), not `editor.getEditorState()` (committed,
 * pre-mutation mid-update). Pass `content` when the caller already has the
 * markdown to avoid recomputing it; otherwise it's derived from the tree.
 * Falls back to the cloned selection when offsets are missing/unresolvable.
 */
export function $restoreSelection(
  saved: SavedSelection,
  content?: string,
): void {
  if (saved.anchor !== null && saved.focus !== null) {
    const md = content ?? $convertToMarkdownString(TRANSFORMERS, $getRoot());
    const postSpans = $collectTextNodeSpans(md);
    const anchor = findPosition(postSpans, saved.anchor);
    const focus = findPosition(postSpans, saved.focus);
    if (anchor !== null && focus !== null) {
      $setSelection($createSelection({ anchor, focus }));
      return;
    }
  }
  $setSelection(saved.selection);
}
