import { assertEquals } from "@std/assert";
import { formatCount, formatDateTime, formatRelativeTime } from "./format.ts";

Deno.test("formatCount -- locale number with pluralized noun", () => {
  assertEquals(formatCount(1, "word"), "1 word");
  assertEquals(formatCount(0, "file"), "0 files");
  assertEquals(formatCount(1234, "word"), `${(1234).toLocaleString()} words`);
  assertEquals(formatCount(1, "entry", "entries"), "1 entry");
});

Deno.test("formatRelativeTime -- recent times are just now", () => {
  const now = Date.now();
  assertEquals(formatRelativeTime(now - 5_000, now), "just now");
  assertEquals(formatRelativeTime(now - 59_000, now), "just now");
});

Deno.test("formatRelativeTime -- minutes, hours, days", () => {
  const now = Date.now();
  assertEquals(formatRelativeTime(now - 60_000, now), "1 minute ago");
  assertEquals(formatRelativeTime(now - 120_000, now), "2 minutes ago");
  assertEquals(
    formatRelativeTime(now - 3 * 3_600_000, now),
    "about 3 hours ago",
  );
  assertEquals(formatRelativeTime(now - 48 * 3_600_000, now), "2 days ago");
});

Deno.test("formatDateTime -- relative day, 12-hour clock", () => {
  const now = new Date(2026, 8, 17, 17, 49).getTime();
  assertEquals(
    formatDateTime(new Date(2026, 8, 17, 9, 49).getTime(), now),
    "today, 9:49 am",
  );
  assertEquals(
    formatDateTime(new Date(2026, 8, 17, 0, 5).getTime(), now),
    "today, 12:05 am",
  );
  assertEquals(
    formatDateTime(new Date(2026, 8, 16, 23, 5).getTime(), now),
    "yesterday, 11:05 pm",
  );
  assertEquals(
    formatDateTime(new Date(2026, 8, 6, 14, 31).getTime(), now),
    "Sep 6, 2026, 2:31 pm",
  );
});
