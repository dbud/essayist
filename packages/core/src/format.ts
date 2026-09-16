// Singular for exactly 1, plural otherwise. Pass `plural` for irregular
// forms ("entry" / "entries").
export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
