import { TokenizedText, wordTokens } from "@/vfs/text_search.ts";
import { trimContextSeparators, wordEdges } from "@/vfs/text_utils.ts";
import { computeDiff, type DiffHunk } from "./diff.ts";
import type { Mark } from "./types.ts";

let resolverMarkCounter = 0;

function generateMarkId(): string {
  return `mark_${Date.now()}_${++resolverMarkCounter}`;
}

/** Default fuzzy threshold for matching context (Phase 2). */
export const DEFAULT_CONTEXT_FUZZY_THRESHOLD = 0.8;

/** Multiplier for the mark's word count to determine the search radius. */
export const DEFAULT_SEARCH_RADIUS_MULTIPLIER = 2;

/** Minimum search radius, in tokens (words). */
export const DEFAULT_MIN_SEARCH_RADIUS = 60;

export interface ResolveInput {
  marks: Mark[];
  oldContent: string;
  newContent: string;
}

export interface ResolveOptions {
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
  if (marks.length === 0) return [];

  const hunks = computeDiff(oldContent, newContent);
  const tokenizedText = new TokenizedText(newContent);

  return marks.map((mark) => {
    if (mark.status === "stale") {
      return { ...mark, id: generateMarkId() };
    }

    const [exact, newOffset, newLength] = mapOffset(mark, hunks);
    if (exact) {
      return {
        ...mark,
        id: generateMarkId(),
        offset: newOffset,
        length: newLength,
        selected_text: newContent.slice(newOffset, newOffset + newLength),
      };
    }

    return fuzzyResolveMark(mark, tokenizedText, newOffset, options);
  });
}

function mapOffset(mark: Mark, hunks: DiffHunk[]): [boolean, number, number] {
  const markStart = mark.offset;
  const markEnd = mark.offset + mark.length;
  let offsetDelta = 0;
  let lengthDelta = 0;
  for (const hunk of hunks) {
    if (markEnd <= hunk.oldStart) {
      break;
    }
    if (markStart < hunk.oldEnd && markEnd > hunk.oldStart) {
      // Mark overlaps this hunk.
      //
      // If the hunk is contained within the mark (allowing boundary
      // contact, but strictly contained on at least one side), the edit
      // is inside the marked region: keep the offset and adjust length.
      // A hunk that exactly equals the mark span is NOT treated as
      // inside -- that case (the whole marked text was replaced) is
      // left to fuzzy matching.
      const hunkIsInsideMark =
        markStart <= hunk.oldStart &&
        markEnd >= hunk.oldEnd &&
        (markStart < hunk.oldStart || markEnd > hunk.oldEnd);
      if (!hunkIsInsideMark) {
        // Mark boundary is at or inside the hunk -- go fuzzy.
        const oldSpan = hunk.oldEnd - hunk.oldStart;
        const ratio = oldSpan > 0 ? (markStart - hunk.oldStart) / oldSpan : 0;
        const estimatedOffset =
          hunk.newStart + Math.round(ratio * (hunk.newEnd - hunk.newStart));
        return [false, estimatedOffset, 0];
      }
      // Hunk is inside the mark -- offset stays, length adjusts by the
      // hunk's own net length change.
      lengthDelta +=
        hunk.newEnd - hunk.newStart - (hunk.oldEnd - hunk.oldStart);
      continue;
    }
    // Hunk is before the mark -- accumulate its net length change.
    offsetDelta += hunk.newEnd - hunk.newStart - (hunk.oldEnd - hunk.oldStart);
  }
  return [true, markStart + offsetDelta, mark.length + lengthDelta];
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
  tt: TokenizedText,
  expectedNewOffset: number,
  options?: ResolveOptions,
): Mark {
  const {
    contextFuzzyThreshold = DEFAULT_CONTEXT_FUZZY_THRESHOLD,
    searchRadiusMultiplier = DEFAULT_SEARCH_RADIUS_MULTIPLIER,
    minSearchRadius = DEFAULT_MIN_SEARCH_RADIUS,
  } = options ?? {};

  // Search radius is in word units, scaled by the mark's word count.
  const markWords =
    wordTokens(mark.before_context).length +
    wordTokens(mark.selected_text).length +
    wordTokens(mark.after_context).length;
  const radiusTokens = Math.max(
    minSearchRadius,
    searchRadiusMultiplier * markWords,
  );

  // Phase 1: find the selected text exactly near the expected offset.
  const selectedOffset = tt.findExactInTokenWindow(mark.selected_text, {
    near: expectedNewOffset,
    withinTokens: radiusTokens,
  });
  if (selectedOffset !== null) {
    return {
      ...mark,
      id: generateMarkId(),
      offset: selectedOffset,
      length: mark.selected_text.length,
      selected_text: mark.selected_text,
      status: "resolved",
    };
  }

  // Phase 2: anchor via before/after context (token multiset fuzzy).
  //
  // Boundaries are snapped to word edges so the resolved selected_text does
  // not pick up surrounding separators:
  //   - before: the selection starts at nextOffset (the word after the
  //     before_context).
  //   - after: the selection ends at startOffset (the after_context's first
  //     word); the separators between the selection and that word stay in
  //     the gap and are trimmed below (the original selected_text decides
  //     whether trailing punctuation belongs to the selection or to the
  //     after_context).
  function matchContext(
    text: string,
    near: number,
    side: "before" | "after",
  ): { startOffset: number; nextOffset: number } | null {
    if (text.length === 0) return null;
    const match = tt.findFuzzyInTokenWindow(text, {
      near,
      withinTokens: radiusTokens,
      threshold: contextFuzzyThreshold,
      side,
    });
    if (!match) return null;
    return { startOffset: match.startOffset, nextOffset: match.nextOffset };
  }

  const beforeResult = matchContext(
    mark.before_context,
    expectedNewOffset,
    "before",
  );
  const afterResult = matchContext(
    mark.after_context,
    // Anchor the after-context search at the end of the before match, else
    // at the original estimate.
    beforeResult?.nextOffset ?? expectedNewOffset,
    "after",
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
        beforeResult?.nextOffset ??
        afterResult?.startOffset ??
        expectedNewOffset,
      length: 0,
    };
  }

  // Both contexts matched but in reversed order (after_context sits
  // before before_context): the neighborhood structure is gone, go
  // stale. Abutting contexts (afterStart == beforeEnd) are still valid
  // (zero-length resolved mark) and stay resolved.
  const beforeEnd = beforeResult?.nextOffset;
  const afterStart = afterResult?.startOffset;
  if (beforeEnd != null && afterStart != null && afterStart < beforeEnd) {
    return {
      ...mark,
      id: generateMarkId(),
      status: "stale",
      offset: beforeEnd,
      length: 0,
    };
  }

  const start = beforeEnd ?? 0;
  const end = afterStart ?? tt.length;

  // Phase 3: full-content scan for the selected text (it may have moved).
  const nearestOffset = tt.findExactNear(mark.selected_text, expectedNewOffset);
  // Nothing found anywhere -- stale.
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

  // Resolve to [start, end), trimming surrounding separators that
  // belong to the contexts rather than the selection. Whitespace is
  // always trimmed; punctuation is trimmed only on a side where the
  // original selected_text starts/ends with a word character (so a
  // selection that genuinely includes trailing punctuation keeps it).
  const raw = tt.text.slice(start, end);
  const { startsWithWord, endsWithWord } = wordEdges(mark.selected_text);
  const trimmed = trimContextSeparators(raw, startsWithWord, endsWithWord);
  // If the selected text was deleted (empty gap), only treat it as a
  // zero-length resolved mark when BOTH contexts matched and abut --
  // that confidently locates where the text was. With only one context
  // (the other empty or missing), the selection is just gone: stale.
  if (trimmed.text.length === 0 && !(beforeResult && afterResult)) {
    return {
      ...mark,
      id: generateMarkId(),
      status: "stale",
      offset: start + trimmed.leading,
      length: 0,
    };
  }
  return {
    ...mark,
    id: generateMarkId(),
    offset: start + trimmed.leading,
    length: trimmed.text.length,
    selected_text: trimmed.text,
    status: "resolved",
  };
}
