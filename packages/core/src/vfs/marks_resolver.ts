import { fuzzyFindNear } from "@/vfs/fuzzy.ts";
import { computeDiff, type DiffHunk } from "./diff.ts";
import type { Mark } from "./types.ts";

let resolverMarkCounter = 0;

function generateMarkId(): string {
  return `mark_${Date.now()}_${++resolverMarkCounter}`;
}

/** Default fuzzy threshold for matching selected text (Phase 1). */
export const DEFAULT_SELECTED_TEXT_FUZZY_THRESHOLD = 0.8;

/** Default fuzzy threshold for matching context (Phase 2). */
export const DEFAULT_CONTEXT_FUZZY_THRESHOLD = 0.8;

/** Multiplier for anchor length to determine search radius. */
export const DEFAULT_SEARCH_RADIUS_MULTIPLIER = 2;

/** Minimum search radius in characters. */
export const DEFAULT_MIN_SEARCH_RADIUS = 300;

export interface ResolveInput {
  marks: Mark[];
  oldContent: string;
  newContent: string;
}

export interface ResolveOptions {
  selectedTextFuzzyThreshold?: number;
  contextFuzzyThreshold?: number;
  searchRadiusMultiplier?: number;
  minSearchRadius?: number;
}

/**
 * Resolve a set of marks from an old version against new content.
 *
 * The algorithm:
 * 1. Compute a word-level diff between old and new content.
 * 2. For each mark, check if it falls in an unchanged region.
 *    - If yes: map its offset arithmetically.
 *    - If no: search for the mark's text using fuzzy matching.
 * 3. Marks whose text cannot be found are returned as stale.
 *
 * Marks that were already stale in the previous version are preserved
 * as stale (they are not re-searched).
 */
export function resolveMarks(
  { marks, newContent, oldContent }: ResolveInput,
  options?: ResolveOptions,
): Mark[] {
  if (oldContent === "" || oldContent === newContent) {
    return marks.map((m) => ({ ...m, id: generateMarkId() }));
  }

  const hunks = computeDiff(oldContent, newContent);

  return marks.map((mark) => {
    if (mark.status === "stale") {
      return { ...mark, id: generateMarkId() };
    }

    const [exact, newOffset] = mapOffset(mark, hunks);
    if (exact) {
      return { ...mark, id: generateMarkId(), offset: newOffset };
    }

    return fuzzyResolveMark(mark, newContent, newOffset, options);
  });
}

function mapOffset(mark: Mark, hunks: DiffHunk[]): [boolean, number] {
  const markStart = mark.offset;
  const markEnd = mark.offset + mark.length;
  let delta = 0;
  for (const hunk of hunks) {
    if (markEnd <= hunk.oldStart) {
      break;
    }
    if (markStart < hunk.oldEnd && markEnd > hunk.oldStart) {
      // mark overlaps this hunk
      // Pure insertion (oldStart == oldEnd): insertion point is inside the mark,
      // the mark text is split -- fall through to fuzzy matching below
      // Modified region: estimate new offset based on position within the hunk
      const oldSpan = hunk.oldEnd - hunk.oldStart;
      const ratio = oldSpan > 0 ? (markStart - hunk.oldStart) / oldSpan : 0;
      const estimatedOffset =
        hunk.newStart +
        Math.round(ratio * (hunk.newEnd - hunk.newStart)) +
        delta;
      return [false, estimatedOffset];
    }
    delta = hunk.newEnd - hunk.oldEnd;
  }
  return [true, markStart + delta];
}

/**
 * Find all occurrences of `pattern` in `text` and return the one
 * closest to `targetOffset`. Returns null if no occurrences found.
 */
export function findNearestOccurrence(
  text: string,
  pattern: string,
  targetOffset: number,
): number | null {
  let bestOffset: number | null = null;
  let bestDistance = Infinity;

  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(pattern, searchFrom);
    if (idx === -1) break;
    const distance = Math.abs(idx - targetOffset);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestOffset = idx;
    }
    searchFrom = idx + 1;
  }

  return bestOffset;
}

/**
 * Resolve a mark using fuzzy matching when the diff-based offset
 * mapping is not exact (the mark overlaps a changed region).
 *
 * Strategy:
 * 1. Search for the selected text itself near the expected offset
 *    (exact match first, then fuzzy). If found, done.
 * 2. Search for before/after context. If one exists but failed to
 *    match, the neighborhood is gone -- stale. Otherwise compute
 *    the mark region [start, end) from matched contexts.
 * 3. Full-content scan for the selected text. If found at a
 *    different location, the mark was moved -- resolve there.
 * 4. If nothing found anywhere, the mark is stale.
 *    Otherwise resolve to [start, end) (may be zero-length if
 *    the text was deleted).
 */
function fuzzyResolveMark(
  mark: Mark,
  newContent: string,
  expectedNewOffset: number,
  options?: ResolveOptions,
): Mark {
  const {
    selectedTextFuzzyThreshold = DEFAULT_SELECTED_TEXT_FUZZY_THRESHOLD,
    contextFuzzyThreshold = DEFAULT_CONTEXT_FUZZY_THRESHOLD,
    searchRadiusMultiplier = DEFAULT_SEARCH_RADIUS_MULTIPLIER,
    minSearchRadius = DEFAULT_MIN_SEARCH_RADIUS,
  } = options ?? {};

  const searchRadius = Math.max(
    minSearchRadius,
    searchRadiusMultiplier *
      (mark.before_context.length +
        mark.selected_text.length +
        mark.after_context.length),
  );

  // Find selected text near expected offset.
  const textMatch = fuzzyFindNear(
    newContent,
    mark.selected_text,
    expectedNewOffset,
    searchRadius,
    selectedTextFuzzyThreshold,
  );
  if (textMatch) {
    return {
      ...mark,
      id: generateMarkId(),
      offset: textMatch.offset,
      length: textMatch.text.length,
      selected_text: textMatch.text,
      status: "resolved",
    };
  }

  // Find before/after context, extract what's between.

  // Match a context string near center. Returns null for empty text
  // or if no match found.
  function matchContext(
    text: string,
    center: number,
  ): { offset: number; endOffset: number } | null {
    if (text.length === 0) return null;
    const match = fuzzyFindNear(
      newContent,
      text,
      center,
      searchRadius,
      contextFuzzyThreshold,
    );
    if (!match) return null;
    return {
      offset: match.offset,
      endOffset: match.offset + match.text.length,
    };
  }

  const beforeResult = matchContext(mark.before_context, expectedNewOffset);
  const afterResult = matchContext(
    mark.after_context,
    beforeResult?.endOffset ?? expectedNewOffset,
  );

  // One context exists but failed -- neighborhood is gone, go stale.
  if (
    (mark.before_context.length > 0 && !beforeResult) ||
    (mark.after_context.length > 0 && !afterResult)
  ) {
    return {
      ...mark,
      id: generateMarkId(),
      status: "stale",
      offset:
        beforeResult?.endOffset ?? afterResult?.offset ?? expectedNewOffset,
      length: 0,
    };
  }

  const start = beforeResult?.endOffset ?? 0;
  const end = afterResult?.offset ?? newContent.length;

  // Nothing found anywhere -- stale.
  const nearestOffset = findNearestOccurrence(
    newContent,
    mark.selected_text,
    expectedNewOffset,
  );
  if (!beforeResult && !afterResult && nearestOffset === null) {
    return { ...mark, id: generateMarkId(), status: "stale", length: 0 };
  }

  // Full-content scan found the text elsewhere -- resolve at nearest occurrence.
  if (nearestOffset !== null) {
    return {
      ...mark,
      id: generateMarkId(),
      offset: nearestOffset,
      length: mark.selected_text.length,
      status: "resolved",
    };
  }

  // Resolve to [start, end).
  const selectedText = newContent.slice(start, end);
  return {
    ...mark,
    id: generateMarkId(),
    offset: start,
    length: selectedText.length,
    selected_text: selectedText,
    status: "resolved",
  };
}
