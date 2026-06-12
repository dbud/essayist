import { assertEquals } from "@std/assert/equals";
import { assertObjectMatch } from "@std/assert/object-match";
import { fuzzyFind, fuzzyFindNear, fuzzyIndexOf } from "@/vfs/fuzzy.ts";

// fuzzyFind -- exact matches

Deno.test("fuzzyFind -- exact match at start", () => {
  const result = fuzzyFind("hello world", "hello", 1);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
    score: 1,
  });
});

Deno.test("fuzzyFind -- exact match in middle", () => {
  const result = fuzzyFind("hello world", "world", 1);
  assertObjectMatch(result!, {
    offset: 6,
    text: "world",
    score: 1,
  });
});

Deno.test("fuzzyFind -- exact match with high threshold", () => {
  const result = fuzzyFind("hello world", "hello", 0.99);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
    score: 1,
  });
});

// fuzzyFind -- fuzzy matches (single char difference)

Deno.test("fuzzyFind -- single character substitution", () => {
  const result = fuzzyFind("hello world", "hallo", 0.8);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
  });
});

Deno.test("fuzzyFind -- single character insertion in pattern (N+1 window)", () => {
  const result = fuzzyFind("hello world", "helllo", 0.8);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
  });
  assertEquals(result!.text.length, 5);
});

Deno.test("fuzzyFind -- single character deletion in pattern (N-1 window)", () => {
  const result = fuzzyFind("hello world", "helo", 0.8);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
  });
  assertEquals(result!.text.length, 5);
});

Deno.test("fuzzyFind -- N-1 window matches shorter text", () => {
  const result = fuzzyFind("helo world", "hello", 0.7);
  assertObjectMatch(result!, {
    offset: 0,
    text: "helo",
  });
  assertEquals(result!.text.length, 4);
});

// fuzzyFind -- threshold behavior

Deno.test("fuzzyFind -- below threshold returns null", () => {
  const result = fuzzyFind("hello world", "xyz", 0.8);
  assertEquals(result, null);
});

Deno.test("fuzzyFind -- zero threshold matches anything", () => {
  const result = fuzzyFind("hello world", "xyz", 0);
  assertEquals(result !== null, true);
});

Deno.test("fuzzyFind -- score 1 threshold requires exact match", () => {
  const result = fuzzyFind("hello world", "hello", 1);
  assertEquals(result?.score, 1);
});

// fuzzyFind -- empty inputs

Deno.test("fuzzyFind -- empty text returns null", () => {
  const result = fuzzyFind("", "hello", 0.8);
  assertEquals(result, null);
});

Deno.test("fuzzyFind -- empty pattern returns null", () => {
  const result = fuzzyFind("hello world", "", 0.8);
  assertEquals(result, null);
});

// fuzzyFind -- returns best match when multiple candidates exist

Deno.test("fuzzyFind -- returns highest scoring match", () => {
  const result = fuzzyFind("cat bat rat", "bet", 0.6);
  assertObjectMatch(result!, { text: "bat" });
  assertEquals(result!.score >= 0.6, true);
});

Deno.test("fuzzyFind -- fuzzy picks best over partial matches", () => {
  const result = fuzzyFind("abc xyz ab", "abcd", 0.6);
  assertObjectMatch(result!, {
    offset: 0,
    text: "abc",
  });
  assertEquals(result!.score > 0.6, true);
  assertEquals(result!.score < 1, true);
});

Deno.test("fuzzyFind -- single char pattern", () => {
  const result = fuzzyFind("abc", "b", 1);
  assertObjectMatch(result!, {
    offset: 1,
    text: "b",
    score: 1,
  });
});

Deno.test("fuzzyFind -- pattern longer than text", () => {
  const result = fuzzyFind("hi", "hello", 0.5);
  assertEquals(result, null);
});

// fuzzyFindNear -- basic behavior

Deno.test("fuzzyFindNear -- match within radius", () => {
  const result = fuzzyFindNear("hello world", "world", 6, 5, 1);
  assertObjectMatch(result!, {
    offset: 6,
    text: "world",
    score: 1,
  });
});

Deno.test("fuzzyFindNear -- match outside radius returns null", () => {
  const result = fuzzyFindNear("hello world", "hello", 10, 2, 1);
  assertEquals(result, null);
});

Deno.test("fuzzyFindNear -- offset is relative to full text", () => {
  const result = fuzzyFindNear("xxx hello world", "hello", 8, 5, 1);
  assertObjectMatch(result!, {
    offset: 4,
    text: "hello",
  });
});

Deno.test("fuzzyFindNear -- fuzzy match within radius", () => {
  const result = fuzzyFindNear("hello world goodbye", "hallo", 3, 5, 0.8);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
  });
});

// fuzzyFindNear -- boundary clamping

Deno.test("fuzzyFindNear -- center near start clamps to 0", () => {
  const result = fuzzyFindNear("hello world", "hello", 0, 10, 1);
  assertObjectMatch(result!, {
    offset: 0,
    text: "hello",
  });
});

Deno.test("fuzzyFindNear -- center near end clamps to text length", () => {
  const result = fuzzyFindNear("hello world", "world", 11, 5, 1);
  assertObjectMatch(result!, {
    offset: 6,
    text: "world",
  });
});

Deno.test("fuzzyFindNear -- region smaller than pattern returns null", () => {
  const result = fuzzyFindNear("hello world", "hello world!", 0, 5, 0.8);
  assertEquals(result, null);
});

// fuzzyFindNear -- empty inputs

Deno.test("fuzzyFindNear -- empty text returns null", () => {
  const result = fuzzyFindNear("", "hello", 0, 5, 0.8);
  assertEquals(result, null);
});

Deno.test("fuzzyFindNear -- empty pattern returns null", () => {
  const result = fuzzyFindNear("hello world", "", 0, 5, 0.8);
  assertEquals(result, null);
});

// fuzzyIndexOf -- exact match

Deno.test("fuzzyIndexOf -- exact match at start", () => {
  const result = fuzzyIndexOf("hello world", "hello", 0.8);
  assertObjectMatch(result!, {
    index: 0,
    length: 5,
  });
});

Deno.test("fuzzyIndexOf -- exact match in middle", () => {
  const result = fuzzyIndexOf("hello world", "world", 0.8);
  assertObjectMatch(result!, {
    index: 6,
    length: 5,
  });
});

Deno.test("fuzzyIndexOf -- exact match preferred over fuzzy", () => {
  const result = fuzzyIndexOf("hallo world hello", "hallo", 0.8);
  assertObjectMatch(result!, {
    index: 0,
    length: 5,
  });
});

// fuzzyIndexOf -- fuzzy fallback

Deno.test("fuzzyIndexOf -- fuzzy match when no exact match", () => {
  const result = fuzzyIndexOf("hello world", "hallo", 0.8);
  assertObjectMatch(result!, {
    index: 0,
    length: 5,
  });
});

Deno.test("fuzzyIndexOf -- returns null when below threshold", () => {
  const result = fuzzyIndexOf("hello world", "xyz", 0.8);
  assertEquals(result, null);
});

// fuzzyIndexOf -- empty inputs

Deno.test("fuzzyIndexOf -- empty text returns null", () => {
  const result = fuzzyIndexOf("", "hello", 0.8);
  assertEquals(result, null);
});

Deno.test("fuzzyIndexOf -- empty pattern matches at start", () => {
  const result = fuzzyIndexOf("hello world", "", 0.8);
  assertObjectMatch(result!, {
    index: 0,
    length: 0,
  });
});

// fuzzyIndexOf -- match length differs from pattern

Deno.test("fuzzyIndexOf -- match length can differ from pattern", () => {
  const result = fuzzyIndexOf("hello world", "helo", 0.8);
  assertObjectMatch(result!, {
    index: 0,
  });
  assertEquals(result!.length, 5); // matched "hello", not "helo"
});

// -- real-world prose scenarios --

Deno.test("fuzzyFind -- typo in prose", () => {
  const text = "The art of writing requires patience and dedication.";
  const result = fuzzyFind(text, "dedicaton", 0.9);
  assertObjectMatch(result!, {
    text: "dedication",
  });
});

Deno.test("fuzzyFindNear -- find near known position after edit", () => {
  const newText = "The quick brown fox jumps over the lazy cat.";
  const result = fuzzyFindNear(newText, "lazy", 35, 10, 0.8);
  assertObjectMatch(result!, {
    text: "lazy",
  });
});

Deno.test("fuzzyIndexOf -- word changed slightly", () => {
  const text = "The colour of the sky is blue.";
  const result = fuzzyIndexOf(text, "color", 0.8);
  assertObjectMatch(result!, {
    index: 4,
    length: 6,
  });
});
