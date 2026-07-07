import { createTokenizer, type Token } from "@/vfs/text_utils.ts";

const WORD_REGEX = /[\p{L}\p{N}]+/gu;

export const wordTokens = createTokenizer(WORD_REGEX);

/**
 * Word-multiset similarity for context anchoring:
 * |A intersect B| / max(|A|, |B|) over word frequencies.
 *
 * Order-insensitive (a clause reorder still matches as long as the word set
 * survives). Normalizing by the longer length means a window scores 1 only if
 * it contains the whole pattern.
 */
export function tokenDiceSimilarity(a: string[], b: string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return 1;
  if (n === 0 || m === 0) return 0;

  const freqA = new Map<string, number>();
  for (const w of a) freqA.set(w, (freqA.get(w) ?? 0) + 1);
  const freqB = new Map<string, number>();
  for (const w of b) freqB.set(w, (freqB.get(w) ?? 0) + 1);

  let intersection = 0;
  for (const [w, ca] of freqA) {
    const cb = freqB.get(w);
    if (cb) intersection += Math.min(ca, cb);
  }
  return intersection / Math.max(n, m);
}

export interface TokenFuzzyMatch {
  /** Char offset of the matched window's first word. */
  startOffset: number;
  /** Char offset of the next word after the match (end of text if none). */
  nextOffset: number;
  score: number;
}

/** A text plus its word-tokenization, with search and context-capture methods in word units. */
export class TokenizedText {
  readonly #text: string;
  readonly #tokens: Token[];

  constructor(text: string) {
    this.#text = text;
    this.#tokens = wordTokens(text);
  }

  get length(): number {
    return this.#text.length;
  }

  get text(): string {
    return this.#text;
  }

  /**
   * Find an exact occurrence of `pattern` within the character span of the
   * token window around `near`. The window is aligned to word edges, so a
   * match never straddles a word boundary at the edge. Returns the match
   * offset, or null if none is in range.
   */
  findExactInTokenWindow(
    pattern: string,
    { near, withinTokens }: { near: number; withinTokens: number },
  ): number | null {
    const centerIdx = this.#nearestTokenIndex(near);
    const [charStart, charEnd] = this.#windowCharSpan(centerIdx, withinTokens);
    const withinChars = Math.max(near - charStart, charEnd - near);
    return this.findExactNear(pattern, near, withinChars);
  }

  /**
   * Find the exact occurrence of `pattern` nearest to `near` within
   * `[near - charRadius, near + charRadius)`, picking the one closest to
   * `near` (not the leftmost), so marks on repeated text don't drift to the
   * wrong copy. `charRadius` defaults to `Infinity`, scanning the whole text.
   * Returns the match offset, or null if there is none in range.
   */
  findExactNear(
    pattern: string,
    near: number,
    withinChars: number = Infinity,
  ): number | null {
    const start = Math.max(0, near - withinChars);
    const end = Math.min(this.#text.length, near + withinChars);
    if (end - start < pattern.length) return null;

    let bestOffset: number | null = null;
    let bestDist = Infinity;
    let from = start;
    while (true) {
      const idx = this.#text.indexOf(pattern, from);
      if (idx === -1 || idx + pattern.length > end) break;
      const dist = Math.abs(idx - near);
      if (dist < bestDist) {
        bestDist = dist;
        bestOffset = idx;
      }
      from = idx + 1;
    }
    return bestOffset;
  }

  /**
   * Find the token window near `near` whose word multiset best matches
   * `pattern`, scored by word-multiset (token-dice) similarity: order-
   * insensitive and indifferent to punctuation/whitespace. A window matching
   * the pattern in order scores 1. `side` selects which window edge anchors
   * the distance tiebreak: "before" uses the trailing edge (nextOffset),
   * "after" the leading edge (startOffset).
   */
  findFuzzyInTokenWindow(
    pattern: string,
    {
      near,
      withinTokens,
      threshold,
      side,
    }: {
      near: number;
      withinTokens: number;
      threshold: number;
      side: "before" | "after";
    },
  ): TokenFuzzyMatch | null {
    const pWords = wordTokens(pattern);
    if (pWords.length === 0) return null;
    const pTexts = pWords.map((t) => t.text);
    const plen = pTexts.length;

    const centerTokenIndex = this.#nearestTokenIndex(near);
    const windowStart = Math.max(0, centerTokenIndex - withinTokens);
    const windowEnd = Math.min(
      this.#tokens.length,
      centerTokenIndex + withinTokens + 1,
    );
    if (windowEnd - windowStart < plen) return null;

    // Distance (in token indices) from the window's gap-facing edge to
    // center. The gap-facing edge is the one facing the selection:
    //   - "before" (before_context, sits left of the selection) faces it
    //     on its RIGHT edge = the word after the window.
    //   - "after" (after_context, sits right of the selection) faces it
    //     on its LEFT edge = the window's first word.
    // Anchoring on the gap-facing edge stops the window from drifting toward
    // the mark and dropping the context's far words.
    const boundaryDist = (i: number, len: number): number => {
      const leftIdx = i;
      const rightIdx = Math.min(i + len, this.#tokens.length);
      const boundaryIdx = side === "before" ? rightIdx : leftIdx;
      return Math.abs(boundaryIdx - centerTokenIndex);
    };

    const buildMatch = (
      i: number,
      len: number,
      score: number,
    ): TokenFuzzyMatch => {
      return {
        startOffset: this.#tokens[i].offset,
        nextOffset: this.#tokens[i + len]?.offset ?? this.length,
        score,
      };
    };

    let best: TokenFuzzyMatch | null = null;
    let bestDist = Infinity;
    let bestExact = false;

    // One pass over plen-token windows. Each window is scored 1 if it matches
    // the pattern in order, else its word-multiset similarity. Ties prefer
    // an in-order match over a reordered multiset match, then the window whose
    // gap-facing edge is nearest center.
    const consider = (i: number, score: number, isExact: boolean) => {
      if (score < threshold) return;
      const dist = boundaryDist(i, plen);
      if (
        !best ||
        score > best.score ||
        (score === best.score && isExact && !bestExact) ||
        (score === best.score && isExact === bestExact && dist < bestDist)
      ) {
        best = buildMatch(i, plen, score);
        bestDist = dist;
        bestExact = isExact;
      }
    };

    for (let i = windowStart; i + plen <= windowEnd; i++) {
      let isExact = true;
      const wTexts = new Array<string>(plen);
      for (let k = 0; k < plen; k++) {
        const w = this.#tokens[i + k].text;
        wTexts[k] = w;
        if (w !== pTexts[k]) isExact = false;
      }
      consider(i, isExact ? 1 : tokenDiceSimilarity(pTexts, wTexts), isExact);
    }

    return best;
  }

  /**
   * Capture text before `anchor` (the selection start) as whole words. Reaches
   * back `span` chars to `anchor - span`, then snaps outward to the word start
   * at or before that point, so the window starts on a word boundary and
   * never splits a word at the left edge. A word straddling `anchor - span` is
   * included in full. If no word start is that far back (selection near the
   * document start), the window runs to the start of the text.
   */
  captureBeforeContext(anchor: number, span: number): string {
    if (anchor <= 0) return "";
    const target = anchor - span;
    // Largest word start at or before `target`; falls back to the text start.
    let p = 0;
    for (let k = this.#tokens.length - 1; k >= 0; k--) {
      if (this.#tokens[k].offset <= target) {
        p = this.#tokens[k].offset;
        break;
      }
    }
    return this.#text.slice(p, anchor);
  }

  /**
   * Capture text after `anchor` (the selection end) as whole words. Reaches
   * forward `span` chars to `anchor + span`, then snaps outward to the word end
   * at or after that point, so the window ends on a word boundary. A word
   * straddling `anchor + span` is included in full. If no word end is that far
   * (selection near the document end), the window runs to the end of the text.
   */
  captureAfterContext(anchor: number, span: number): string {
    const n = this.#text.length;
    if (anchor >= n) return "";

    const target = anchor + span;
    // Smallest word end at or after `target`; falls back to the text end.
    let e = n;
    for (const t of this.#tokens) {
      if (t.endOffset >= target) {
        e = t.endOffset;
        break;
      }
    }
    return this.#text.slice(anchor, e);
  }

  #nearestTokenIndex(charOffset: number): number {
    const tokens = this.#tokens;
    if (tokens.length === 0) return 0;
    let lo = 0;
    let hi = tokens.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tokens[mid].offset < charOffset) lo = mid + 1;
      else hi = mid;
    }
    let best = lo;
    if (lo > 0) {
      const dLo = Math.abs(tokens[lo].offset - charOffset);
      const dPrev = Math.abs(tokens[lo - 1].offset - charOffset);
      if (dPrev <= dLo) best = lo - 1;
    }
    return best;
  }

  #windowCharSpan(idx: number, radiusTokens: number): [number, number] {
    const windowStart = Math.max(0, idx - radiusTokens);
    const windowEnd = Math.min(this.#tokens.length, idx + radiusTokens + 1);
    if (windowEnd <= windowStart) return [0, this.#text.length];
    return [
      this.#tokens[windowStart].offset,
      this.#tokens[windowEnd - 1].endOffset,
    ];
  }
}
