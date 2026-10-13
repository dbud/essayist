/**
 * Pure grep matching: line matches with before/after context, the
 * literal-escape fallback for invalid regexes, and the default context span.
 */

/** How many context lines surround each match. */
export const DEFAULT_CONTEXT_LINES = 2;

export interface LineMatch {
  line_number: number;
  line: string;
  before: string[];
  after: string[];
}

/** Escape a text so it matches literally in a regex. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile `pattern` as a regex; an invalid regex falls back to a literal. */
export function compilePattern(
  pattern: string,
  caseSensitive: boolean,
): RegExp {
  const flags = caseSensitive ? "g" : "gi";
  try {
    return new RegExp(pattern, flags);
  } catch {
    return new RegExp(escapeRegex(pattern), flags);
  }
}

/** Line matches with context, in document order. */
export function matchLines(
  content: string,
  regex: RegExp,
  contextSpan: number,
): LineMatch[] {
  const lines = content.split("\n");
  const matches: LineMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    regex.lastIndex = 0;
    if (regex.test(lines[i])) {
      matches.push({
        line_number: i + 1,
        line: lines[i],
        before: lines.slice(Math.max(0, i - contextSpan), i),
        after: lines.slice(i + 1, Math.min(lines.length, i + 1 + contextSpan)),
      });
    }
  }
  return matches;
}
