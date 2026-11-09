import { format, formatDistance, isSameDay, subDays } from "date-fns";

// Singular for exactly 1, plural otherwise. Pass `plural` for irregular forms ("entry" /
// "entries").
export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

// Locale-formatted count with a pluralized noun: "1 word", "1,234 words".
export function formatCount(count: number, singular: string, plural?: string) {
  return `${count.toLocaleString()} ${pluralize(count, singular, plural)}`;
}

// Human friendly past time: "just now", "2 minutes ago", "3 days ago". `now` is injectable for
// tests.
export function formatRelativeTime(ts: number, now: number = Date.now()) {
  if (now - ts < 60_000) return "just now";
  return formatDistance(ts, now, { addSuffix: true });
}

// Elapsed time as zero-padded mm:ss, or h:mm:ss past an hour.
export function formatDuration(ms: number) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const parts = [Math.floor(secs / 3600), Math.floor((secs / 60) % 60), secs % 60];
  const shown = parts.slice(parts[0] > 0 ? 0 : 1);
  return shown.map((part) => String(part).padStart(2, "0")).join(":");
}

// Deterministic timestamp shared by SSR and the client: relative day and a 12-hour clock without a
// leading hour zero. `now` is injectable for tests.
export function formatDateTime(ts: number, now: number = Date.now()) {
  const date = new Date(ts);
  const day = isSameDay(date, now)
    ? "today"
    : isSameDay(date, subDays(now, 1))
      ? "yesterday"
      : format(date, "MMM d, yyyy");
  return `${day}, ${format(date, "h:mm a").toLowerCase()}`;
}
