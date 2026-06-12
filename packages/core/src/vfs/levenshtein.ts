/**
 * Compute Levenshtein similarity between two strings.
 * Returns a value from 0 (completely different) to 1 (identical).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses single-row DP with O(min(a, b)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length < b.length) [a, b] = [b, a];

  const n = a.length;
  const m = b.length;

  if (m === 0) return n;

  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let curr = new Array(m + 1);

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}
