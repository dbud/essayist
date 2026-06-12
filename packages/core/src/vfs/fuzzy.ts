import { levenshteinSimilarity } from "@/vfs/levenshtein.ts";

export interface FuzzyMatch {
  offset: number;
  text: string;
  score: number;
}

/**
 * Find the best fuzzy match of `pattern` in `text`.
 * Tries sliding windows of length N-1, N, and N+1 (where N is
 * pattern.length) to handle single-character insertions and deletions.
 * Returns the match with the highest Levenshtein similarity above
 * the threshold, or null.
 */
export function fuzzyFind(
  text: string,
  pattern: string,
  threshold: number,
): FuzzyMatch | null {
  if (text.length === 0 || pattern.length === 0) return null;

  let best: FuzzyMatch | null = null;

  const minWindow = Math.max(1, pattern.length - 1);
  const maxWindow = pattern.length + 1;

  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize++) {
    if (text.length < windowSize) continue;

    for (let i = 0; i <= text.length - windowSize; i++) {
      const candidate = text.slice(i, i + windowSize);
      const score = levenshteinSimilarity(pattern, candidate);
      if (score >= threshold && (!best || score > best.score)) {
        best = { offset: i, text: candidate, score };
      }
    }
  }

  return best;
}

/**
 * Find the best fuzzy match of `pattern` in `text` within
 * [center - radius, center + radius). Returns null if no match
 * exceeds the threshold.
 */
export function fuzzyFindNear(
  text: string,
  pattern: string,
  center: number,
  radius: number,
  threshold: number,
): FuzzyMatch | null {
  const start = Math.max(0, center - radius);
  const end = Math.min(text.length, center + radius);
  if (end - start < pattern.length) return null;

  const segment = text.slice(start, end);
  const best = fuzzyFind(segment, pattern, threshold);
  if (!best) return null;

  return {
    offset: start + best.offset,
    text: best.text,
    score: best.score,
  };
}

/**
 * Find `pattern` within `text` using fuzzy matching.
 * Tries an exact match first, then falls back to fuzzyFind.
 * Returns the index and length of the match, or null.
 */
export function fuzzyIndexOf(
  text: string,
  pattern: string,
  threshold: number,
): { index: number; length: number } | null {
  const exactIdx = text.indexOf(pattern);
  if (exactIdx !== -1) {
    return { index: exactIdx, length: pattern.length };
  }

  const best = fuzzyFind(text, pattern, threshold);
  if (best) {
    return { index: best.offset, length: best.text.length };
  }

  return null;
}
