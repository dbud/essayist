import { assertEquals, assertThrows } from "@std/assert";
import {
  createTokenizer,
  trimContextSeparators,
  wordEdges,
} from "@/vfs/text_utils.ts";

// createTokenizer -- scans a global regex into tokens with offsets

Deno.test("createTokenizer -- splits text into tokens with offsets", () => {
  const tokenize = createTokenizer(/\w+/g);
  assertEquals(tokenize("hello world"), [
    { text: "hello", offset: 0, endOffset: 5 },
    { text: "world", offset: 6, endOffset: 11 },
  ]);
});

Deno.test("createTokenizer -- empty string yields no tokens", () => {
  const tokenize = createTokenizer(/\w+/g);
  assertEquals(tokenize(""), []);
});

Deno.test("createTokenizer -- throws on a non-global regex", () => {
  // A non-global regex would loop forever on exec, so build rejects it.
  assertThrows(() => createTokenizer(/\w+/), TypeError);
});

Deno.test("createTokenizer -- reusable across calls (lastIndex reset)", () => {
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

// wordEdges -- whether each edge of a text is a word character

Deno.test("wordEdges -- word at both ends", () => {
  assertEquals(wordEdges("hello"), {
    startsWithWord: true,
    endsWithWord: true,
  });
});

Deno.test("wordEdges -- punctuation at both ends", () => {
  assertEquals(wordEdges(",hello,"), {
    startsWithWord: false,
    endsWithWord: false,
  });
});

Deno.test("wordEdges -- mixed edges", () => {
  assertEquals(wordEdges("hello,"), {
    startsWithWord: true,
    endsWithWord: false,
  });
  assertEquals(wordEdges(",hello"), {
    startsWithWord: false,
    endsWithWord: true,
  });
});

Deno.test("wordEdges -- empty text has no word edges", () => {
  assertEquals(wordEdges(""), { startsWithWord: false, endsWithWord: false });
});

Deno.test("wordEdges -- single char is both start and end", () => {
  assertEquals(wordEdges("a"), { startsWithWord: true, endsWithWord: true });
  assertEquals(wordEdges(","), { startsWithWord: false, endsWithWord: false });
});

Deno.test("wordEdges -- Unicode letters and numbers count as word chars", () => {
  assertEquals(wordEdges("café"), { startsWithWord: true, endsWithWord: true });
  assertEquals(wordEdges("5abc"), { startsWithWord: true, endsWithWord: true });
});

// trimContextSeparators -- trim surrounding separators from a resolved gap.
// `trimLeadingPunctuation` / `trimTrailingPunctuation` say whether punctuation
// is trimmed on that side (whitespace is always trimmed).

Deno.test("trimContextSeparators -- empty raw returns empty", () => {
  assertEquals(trimContextSeparators("", true, true), { text: "", leading: 0 });
});

Deno.test("trimContextSeparators -- trims surrounding whitespace", () => {
  assertEquals(trimContextSeparators("  hello  ", true, true), {
    text: "hello",
    leading: 2,
  });
});

Deno.test("trimContextSeparators -- trims leading whitespace and punctuation", () => {
  assertEquals(trimContextSeparators("  ,hello  ", true, true), {
    text: "hello",
    leading: 3,
  });
});

Deno.test("trimContextSeparators -- trims trailing punctuation when enabled", () => {
  assertEquals(trimContextSeparators("hello,", true, true), {
    text: "hello",
    leading: 0,
  });
});

Deno.test("trimContextSeparators -- keeps surrounding punctuation when disabled", () => {
  assertEquals(trimContextSeparators(",hello,", false, false), {
    text: ",hello,",
    leading: 0,
  });
});

Deno.test("trimContextSeparators -- keeps trailing punctuation when trailing flag is false", () => {
  assertEquals(trimContextSeparators("  hello,", true, false), {
    text: "hello,",
    leading: 2,
  });
});

Deno.test("trimContextSeparators -- keeps leading punctuation when leading flag is false", () => {
  assertEquals(trimContextSeparators("  ,hello  ", false, true), {
    text: ",hello",
    leading: 2,
  });
});

Deno.test("trimContextSeparators -- preserves internal separators", () => {
  // Only the surrounding whitespace is trimmed; the internal ", " stays.
  assertEquals(trimContextSeparators("  hello, world  ", true, true), {
    text: "hello, world",
    leading: 2,
  });
});

Deno.test("trimContextSeparators -- trims a leading comma but not the space after it", () => {
  // Whitespace is trimmed first, then punctuation; the space following the
  // comma is not re-trimmed, so it survives at the start of the text.
  assertEquals(trimContextSeparators(", hello,", true, true), {
    text: " hello",
    leading: 1,
  });
});

Deno.test("trimContextSeparators -- whitespace-only raw trims to empty", () => {
  assertEquals(trimContextSeparators("   ", true, true), {
    text: "",
    leading: 3,
  });
});

Deno.test("trimContextSeparators -- all-punctuation raw trims to empty when enabled", () => {
  assertEquals(trimContextSeparators(",,,,", true, true), {
    text: "",
    leading: 4,
  });
});

Deno.test("trimContextSeparators -- flags are independent per side", () => {
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
