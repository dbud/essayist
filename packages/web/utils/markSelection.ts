import type { Mark } from "@essayist/core";
import { resolveMarks } from "@essayist/core";
import { $wrapSelectionInMarkNode } from "@lexical/mark";
import type { LexicalEditor, RangeSelection } from "lexical";
import { $createRangeSelection } from "lexical";
import type { NodeRange } from "./markMapping.ts";
import { buildMarkdownMapping, findRange } from "./markMapping.ts";

export interface MarkWithRange {
  mark: Mark;
  range: NodeRange;
}

export interface MarkResolutionResult {
  resolved: MarkWithRange[];
  unmapped: Mark[];
  markdown: string;
}

/**
 * Resolves VFS marks (plaintext offsets) to Lexical node ranges.
 * Exports editor to markdown, remaps offsets via resolveMarks(),
 * then maps each mark to a TextNode range using binary search.
 * Stale and zero-length marks are included for visualization.
 */
export function resolveMarksForEditor(
  editor: LexicalEditor,
  originalContent: string,
  marks: Mark[],
): MarkResolutionResult {
  const { spans, markdown } = buildMarkdownMapping(editor);

  const remappedMarks = resolveMarks({
    marks,
    oldContent: originalContent,
    newContent: markdown,
  });

  const resolved: MarkWithRange[] = [];
  const unmapped: Mark[] = [];

  for (const mark of remappedMarks) {
    const range = findRange(spans, mark.offset, mark.length);
    if (range) {
      resolved.push({ mark, range });
    } else {
      unmapped.push(mark);
    }
  }

  return { resolved, unmapped, markdown };
}

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
