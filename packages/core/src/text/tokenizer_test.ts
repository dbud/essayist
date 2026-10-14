import { assertEquals, assertThrows } from "@std/assert";
import { test } from "vitest";
import { createTokenizer } from "@/text/tokenizer.ts";

// createTokenizer -- scans a global regex into tokens with offsets

test("createTokenizer -- splits text into tokens with offsets", () => {
  const tokenize = createTokenizer(/\w+/g);
  assertEquals(tokenize("hello world"), [
    { text: "hello", offset: 0, endOffset: 5 },
    { text: "world", offset: 6, endOffset: 11 },
  ]);
});

test("createTokenizer -- empty string yields no tokens", () => {
  const tokenize = createTokenizer(/\w+/g);
  assertEquals(tokenize(""), []);
});

test("createTokenizer -- throws on a non-global regex", () => {
  // A non-global regex would loop forever on exec, so build rejects it.
  assertThrows(() => createTokenizer(/\w+/), TypeError);
});

test("createTokenizer -- reusable across calls (lastIndex reset)", () => {
  const tokenize = createTokenizer(/\w+/g);
  assertEquals(
    tokenize("a b").map((t) => t.text),
    ["a", "b"],
  );
  // A second call must start fresh, not from the previous lastIndex.
  assertEquals(
    tokenize("c d").map((t) => t.text),
    ["c", "d"],
  );
});
