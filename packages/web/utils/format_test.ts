import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  formatCount,
  formatDateTime,
  formatRelativeTime,
  pluralize,
} from "./format.ts";

Deno.test("pluralize -- singular for 1, plural otherwise", () => {
  assertEquals(pluralize(0, "word"), "words");
  assertEquals(pluralize(1, "word"), "word");
  assertEquals(pluralize(2, "word"), "words");
  assertEquals(pluralize(1234, "word"), "words");
});

Deno.test("pluralize -- irregular form", () => {
  assertEquals(pluralize(1, "entry", "entries"), "entry");
  assertEquals(pluralize(3, "entry", "entries"), "entries");
});

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

Deno.test("formatDateTime -- full date and time", () => {
  const ts = new Date(2026, 8, 6, 14, 31, 5).getTime();
  const text = formatDateTime(ts);
  assertStringIncludes(text, "2026");
  assertStringIncludes(text, ":31:05");
});
