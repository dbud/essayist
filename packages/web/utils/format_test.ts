import { assertEquals } from "@std/assert";
import { formatCount, pluralize } from "./format.ts";

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
