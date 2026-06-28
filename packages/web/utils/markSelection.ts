import { $wrapSelectionInMarkNode } from "@lexical/mark";
import type { RangeSelection } from "lexical";
import { $createRangeSelection } from "lexical";
import type { MarkWithRange } from "@/signals/marks.ts";
import type { NodeRange } from "@/utils/textNodeMapping.ts";

/**
 * Creates a Lexical RangeSelection from a node range.
 */
export function createRangeSelection(range: NodeRange): RangeSelection {
  const selection = $createRangeSelection();
  selection.anchor.set(range.anchor.key, range.anchor.offset, "text");
  selection.focus.set(range.focus.key, range.focus.offset, "text");
  return selection;
}

/**
 * Wraps a mark with range in a MarkNode in the editor.
 * Must be called inside an editor.update().
 */
export function applyMarkToEditor({ range, mark }: MarkWithRange) {
  const selection = createRangeSelection(range);
  $wrapSelectionInMarkNode(selection, /* isBackward */ false, mark.id);
}
