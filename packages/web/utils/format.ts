// Singular for exactly 1, plural otherwise. Pass `plural` for irregular
// forms ("entry" / "entries").
export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

// Locale-formatted count with a pluralized noun: "1 word", "1,234 words".
export function formatCount(count: number, singular: string, plural?: string) {
  return `${count.toLocaleString()} ${pluralize(count, singular, plural)}`;
}
