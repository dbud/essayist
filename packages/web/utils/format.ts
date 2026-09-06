import { formatDistance } from "date-fns";

// Singular for exactly 1, plural otherwise. Pass `plural` for irregular
// forms ("entry" / "entries").
export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

// Locale-formatted count with a pluralized noun: "1 word", "1,234 words".
export function formatCount(count: number, singular: string, plural?: string) {
  return `${count.toLocaleString()} ${pluralize(count, singular, plural)}`;
}

// Human friendly past time: "just now", "2 minutes ago", "3 days ago".
// `now` is injectable for tests.
export function formatRelativeTime(ts: number, now: number = Date.now()) {
  if (now - ts < 60_000) return "just now";
  return formatDistance(ts, now, { addSuffix: true });
}

// Exact date and time for tooltips: "Sep 6, 2026, 2:31:05 PM".
export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
