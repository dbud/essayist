import { pluralize } from "@essayist/core";
import { format, formatDistance, isSameDay, subDays } from "date-fns";

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

// Deterministic timestamp shared by SSR and the client: relative day
// and a 12-hour clock without a leading hour zero.
// `now` is injectable for tests.
export function formatDateTime(ts: number, now: number = Date.now()) {
  const date = new Date(ts);
  const day = isSameDay(date, now)
    ? "today"
    : isSameDay(date, subDays(now, 1))
      ? "yesterday"
      : format(date, "MMM d, yyyy");
  return `${day}, ${format(date, "h:mm a").toLowerCase()}`;
}
