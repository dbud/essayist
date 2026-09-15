import { assertEquals } from "@std/assert";
import { pluralize } from "./format.ts";

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
