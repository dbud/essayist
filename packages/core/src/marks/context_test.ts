import { assertEquals } from "@std/assert";
import { test } from "vitest";
import { trimContextSeparators, wordEdges } from "./context.ts";

// wordEdges -- whether each edge of a text is a word character

test("wordEdges -- word at both ends", () => {
  assertEquals(wordEdges("hello"), {
    startsWithWord: true,
    endsWithWord: true,
  });
});

test("wordEdges -- punctuation at both ends", () => {
  assertEquals(wordEdges(",hello,"), {
    startsWithWord: false,
    endsWithWord: false,
  });
});

test("wordEdges -- mixed edges", () => {
  assertEquals(wordEdges("hello,"), {
    startsWithWord: true,
    endsWithWord: false,
  });
  assertEquals(wordEdges(",hello"), {
    startsWithWord: false,
    endsWithWord: true,
  });
});

test("wordEdges -- empty text has no word edges", () => {
  assertEquals(wordEdges(""), { startsWithWord: false, endsWithWord: false });
});

test("wordEdges -- single char is both start and end", () => {
  assertEquals(wordEdges("a"), { startsWithWord: true, endsWithWord: true });
  assertEquals(wordEdges(","), { startsWithWord: false, endsWithWord: false });
});

test("wordEdges -- Unicode letters and numbers count as word chars", () => {
  assertEquals(wordEdges("café"), { startsWithWord: true, endsWithWord: true });
  assertEquals(wordEdges("5abc"), { startsWithWord: true, endsWithWord: true });
});

// trimContextSeparators -- trim surrounding separators from a resolved gap.
// `trimLeadingPunctuation` / `trimTrailingPunctuation` say whether punctuation
// is trimmed on that side (whitespace is always trimmed).

test("trimContextSeparators -- empty raw returns empty", () => {
  assertEquals(trimContextSeparators("", true, true), { text: "", leading: 0 });
});

test("trimContextSeparators -- trims surrounding whitespace", () => {
  assertEquals(trimContextSeparators("  hello  ", true, true), {
    text: "hello",
    leading: 2,
  });
});

test("trimContextSeparators -- trims leading whitespace and punctuation", () => {
  assertEquals(trimContextSeparators("  ,hello  ", true, true), {
    text: "hello",
    leading: 3,
  });
});

test("trimContextSeparators -- trims trailing punctuation when enabled", () => {
  assertEquals(trimContextSeparators("hello,", true, true), {
    text: "hello",
    leading: 0,
  });
});

test("trimContextSeparators -- keeps surrounding punctuation when disabled", () => {
  assertEquals(trimContextSeparators(",hello,", false, false), {
    text: ",hello,",
    leading: 0,
  });
});

test("trimContextSeparators -- keeps trailing punctuation when trailing flag is false", () => {
  assertEquals(trimContextSeparators("  hello,", true, false), {
    text: "hello,",
    leading: 2,
  });
});

test("trimContextSeparators -- keeps leading punctuation when leading flag is false", () => {
  assertEquals(trimContextSeparators("  ,hello  ", false, true), {
    text: ",hello",
    leading: 2,
  });
});

test("trimContextSeparators -- preserves internal separators", () => {
  // Only the surrounding whitespace is trimmed; the internal ", " stays.
  assertEquals(trimContextSeparators("  hello, world  ", true, true), {
    text: "hello, world",
    leading: 2,
  });
});

test("trimContextSeparators -- trims a leading comma but not the space after it", () => {
  // Whitespace is trimmed first, then punctuation; the space following the
  // comma is not re-trimmed, so it survives at the start of the text.
  assertEquals(trimContextSeparators(", hello,", true, true), {
    text: " hello",
    leading: 1,
  });
});

test("trimContextSeparators -- whitespace-only raw trims to empty", () => {
  assertEquals(trimContextSeparators("   ", true, true), {
    text: "",
    leading: 3,
  });
});

test("trimContextSeparators -- all-punctuation raw trims to empty when enabled", () => {
  assertEquals(trimContextSeparators(",,,,", true, true), {
    text: "",
    leading: 4,
  });
});

test("trimContextSeparators -- flags are independent per side", () => {
  // Leading punctuation trimmed, trailing kept.
  assertEquals(trimContextSeparators(",hello,", true, false), {
    text: "hello,",
    leading: 1,
  });
  // Leading kept, trailing trimmed.
  assertEquals(trimContextSeparators(",hello,", false, true), {
    text: ",hello",
    leading: 0,
  });
});
