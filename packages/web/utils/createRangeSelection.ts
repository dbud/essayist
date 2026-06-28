import type { RangeSelection } from "lexical";
import { $createRangeSelection } from "lexical";
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
