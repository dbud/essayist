/** Splits textarea content into a trimmed list of non-empty lines. */
export function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
