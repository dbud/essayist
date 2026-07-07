import { assertEquals } from "@std/assert/equals";
import { assertExists } from "@std/assert/exists";
import { assertObjectMatch } from "@std/assert/object-match";
import {
  TokenizedText,
  tokenDiceSimilarity,
  wordTokens,
} from "@/vfs/text_search.ts";

// TokenizedText.findExactNear -- exact match nearest to a point

Deno.test("TokenizedText.findExactNear -- match nearest to a point", () => {
  const tt = new TokenizedText("hello world");
  assertEquals(tt.findExactNear("world", 6), 6);
});

Deno.test("TokenizedText.findExactNear -- offset is relative to full text", () => {
  const tt = new TokenizedText("xxx hello world");
  assertEquals(tt.findExactNear("hello", 8), 4);
});

Deno.test("TokenizedText.findExactNear -- near start clamps to 0", () => {
  const tt = new TokenizedText("hello world");
  assertEquals(tt.findExactNear("hello", 0), 0);
});

Deno.test("TokenizedText.findExactNear -- near end clamps to text length", () => {
  const tt = new TokenizedText("hello world");
  assertEquals(tt.findExactNear("world", 11), 6);
});

Deno.test("TokenizedText.findExactNear -- pattern longer than text returns null", () => {
  const tt = new TokenizedText("hello world");
  assertEquals(tt.findExactNear("hello world!", 0), null);
});

Deno.test("TokenizedText.findExactNear -- empty text returns null", () => {
  const tt = new TokenizedText("");
  assertEquals(tt.findExactNear("hello", 0), null);
});

Deno.test("TokenizedText.findExactNear -- no exact occurrence returns null", () => {
  // "hallo" is not in the text; with exact-only matching this returns null
  // (a near-match is resolved later via context anchoring, not here).
  const tt = new TokenizedText("hello world goodbye");
  assertEquals(tt.findExactNear("hallo", 3), null);
});

Deno.test("TokenizedText.findExactNear -- finds near known position after edit", () => {
  const tt = new TokenizedText("The quick brown fox jumps over the lazy cat.");
  assertEquals(tt.findExactNear("lazy", 35), 35);
});

Deno.test("TokenizedText.findExactNear -- nearest occurrence wins over leftmost", () => {
  // Repeated text: nearest occurrence to the center wins, not the leftmost.
  const tt = new TokenizedText("foo bar foo bar");
  assertEquals(tt.findExactNear("foo", 10), 8);
  // No occurrence anywhere.
  const tt2 = new TokenizedText("hello world");
  assertEquals(tt2.findExactNear("missing", 0), null);
});

Deno.test("TokenizedText.findExactNear -- charRadius bounds the search", () => {
  const tt = new TokenizedText("hello world");
  // "world" (5 chars) at offset 6 ends at 11, beyond [6 - 3, 6 + 3) = [3, 9).
  assertEquals(tt.findExactNear("world", 6, 3), null);
  // With a larger radius it's found.
  assertEquals(tt.findExactNear("world", 6, 5), 6);
});

// TokenizedText.findExactInTokenWindow -- exact match within a token window

Deno.test("TokenizedText.findExactInTokenWindow -- match within the window", () => {
  const tt = new TokenizedText("alpha beta gamma delta");
  assertEquals(
    tt.findExactInTokenWindow("beta", { near: 6, withinTokens: 1 }),
    6,
  );
});

Deno.test("TokenizedText.findExactInTokenWindow -- outside the window returns null", () => {
  // "hello" sits at offset 0, but the window around near=10 (in "world")
  // covers only the "world" token, so "hello" is out of range.
  const tt = new TokenizedText("hello world");
  assertEquals(
    tt.findExactInTokenWindow("hello", { near: 10, withinTokens: 0 }),
    null,
  );
});

// wordTokens -- splits on non-alphanumeric, keeps offsets

Deno.test("wordTokens -- splits on punctuation and whitespace", () => {
  const tokens = wordTokens("Hello, world! 123");
  assertEquals(
    tokens.map((t) => t.text),
    ["Hello", "world", "123"],
  );
  assertEquals(tokens[0], { text: "Hello", offset: 0, endOffset: 5 });
  assertEquals(tokens[1], { text: "world", offset: 7, endOffset: 12 });
});

Deno.test("wordTokens -- underscore is a separator", () => {
  assertEquals(
    wordTokens("selected_text").map((t) => t.text),
    ["selected", "text"],
  );
});

Deno.test("wordTokens -- empty and whitespace-only yield no tokens", () => {
  assertEquals(wordTokens(""), []);
  assertEquals(wordTokens("   \n\t "), []);
});

// tokenDiceSimilarity -- multiset overlap, order-insensitive

Deno.test("tokenDiceSimilarity -- identical words score 1", () => {
  assertEquals(tokenDiceSimilarity(["a", "b", "c"], ["a", "b", "c"]), 1);
});

Deno.test("tokenDiceSimilarity -- clause reorder scores high", () => {
  // "she needed milk and eggs" -> "milk and eggs were needed"
  assertEquals(
    tokenDiceSimilarity(
      ["she", "needed", "milk", "and", "eggs"],
      ["milk", "and", "eggs", "were", "needed"],
    ),
    4 / 5, // 4 shared words (needed, milk, and, eggs) over max length 5
  );
});

Deno.test("tokenDiceSimilarity -- handles repeated words", () => {
  // "the the" vs "the" -> intersection 1, max 2 -> 0.5
  assertEquals(tokenDiceSimilarity(["the", "the"], ["the"]), 0.5);
});

Deno.test("tokenDiceSimilarity -- disjoint words score 0", () => {
  assertEquals(tokenDiceSimilarity(["a", "b"], ["c", "d"]), 0);
});

// TokenizedText.findFuzzyInTokenWindow -- word-multiset matching

Deno.test("TokenizedText.findFuzzyInTokenWindow -- exact token sequence matches", () => {
  const tt = new TokenizedText("alpha beta gamma delta");
  const result = tt.findFuzzyInTokenWindow("beta gamma", {
    near: 8,
    withinTokens: 20,
    threshold: 0.8,
    side: "after",
  });
  assertExists(result);
  assertObjectMatch(result, { startOffset: 6, nextOffset: 17, score: 1 });
});

Deno.test("TokenizedText.findFuzzyInTokenWindow -- reorder still matches", () => {
  const tt = new TokenizedText("the quick brown fox");
  const result = tt.findFuzzyInTokenWindow("brown quick the", {
    near: 0,
    withinTokens: 50,
    threshold: 0.8,
    side: "before",
  });
  assertExists(result);
  // all three words present (order differs) -> score 1.0
  assertEquals(result?.score, 1);
});

Deno.test("TokenizedText.findFuzzyInTokenWindow -- punctuation differences ignored", () => {
  const tt = new TokenizedText("She said hello there.");
  const result = tt.findFuzzyInTokenWindow("She said, hello there.", {
    near: 0,
    withinTokens: 50,
    threshold: 0.8,
    side: "before",
  });
  assertExists(result);
  assertEquals(result?.score, 1);
});

Deno.test("TokenizedText.findFuzzyInTokenWindow -- nextOffset points at the next word", () => {
  // before_context "alpha beta " -> nextOffset should be start of "gamma"
  const text = "alpha beta gamma delta";
  const tt = new TokenizedText(text);
  const result = tt.findFuzzyInTokenWindow("alpha beta", {
    near: 0,
    withinTokens: 50,
    threshold: 0.8,
    side: "before",
  });
  assertExists(result);
  assertEquals(result?.nextOffset, text.indexOf("gamma"));
});

Deno.test("TokenizedText.findFuzzyInTokenWindow -- below threshold returns null", () => {
  const tt = new TokenizedText("hello world");
  const result = tt.findFuzzyInTokenWindow("xyz abc", {
    near: 0,
    withinTokens: 50,
    threshold: 0.8,
    side: "after",
  });
  assertEquals(result, null);
});

// TokenizedText.captureBeforeContext -- whole-word context before a selection

Deno.test("TokenizedText.captureBeforeContext -- empty at start of document", () => {
  const tt = new TokenizedText("Hello world");
  assertEquals(tt.captureBeforeContext(0, 60), "");
});

Deno.test("TokenizedText.captureBeforeContext -- snaps to the word start at or before offset - span", () => {
  const content = "alpha beta gamma delta MARK";
  const tt = new TokenizedText(content);
  const offset = content.indexOf("MARK");
  assertEquals(tt.captureBeforeContext(offset, 5), "delta ");
});

Deno.test("TokenizedText.captureBeforeContext -- larger span reaches further back", () => {
  const content = "alpha beta gamma delta MARK";
  const tt = new TokenizedText(content);
  const offset = content.indexOf("MARK");
  assertEquals(tt.captureBeforeContext(offset, 7), "gamma delta ");
});

Deno.test("TokenizedText.captureBeforeContext -- includes a long preceding word in full (no cap)", () => {
  const content = `${"A".repeat(100)}MARK`;
  const tt = new TokenizedText(content);
  assertEquals(tt.captureBeforeContext(100, 10), "A".repeat(100));
});

Deno.test("TokenizedText.captureBeforeContext -- near document start captures from the beginning", () => {
  const content = "hi MARK";
  const tt = new TokenizedText(content);
  const offset = content.indexOf("MARK");
  assertEquals(tt.captureBeforeContext(offset, 60), "hi ");
});

// TokenizedText.captureAfterContext -- whole-word context after a selection

Deno.test("TokenizedText.captureAfterContext -- empty at end of document", () => {
  const tt = new TokenizedText("Hello world");
  assertEquals(tt.captureAfterContext(11, 60), "");
});

Deno.test("TokenizedText.captureAfterContext -- snaps to the word end at or after start + span", () => {
  const content = "MARK alpha beta";
  const tt = new TokenizedText(content);
  const start = content.indexOf("MARK") + 4;
  assertEquals(tt.captureAfterContext(start, 5), " alpha");
});

Deno.test("TokenizedText.captureAfterContext -- ends at word boundary, excludes trailing punct", () => {
  const content = "MARK First. Second.";
  const tt = new TokenizedText(content);
  const start = content.indexOf("MARK") + 4;
  assertEquals(tt.captureAfterContext(start, 5), " First");
});

Deno.test("TokenizedText.captureAfterContext -- includes a long following word in full (no cap)", () => {
  const content = `MARK${"B".repeat(100)}`;
  const tt = new TokenizedText(content);
  assertEquals(tt.captureAfterContext(4, 10), "B".repeat(100));
});

Deno.test("TokenizedText.captureAfterContext -- near document end captures to the end of text", () => {
  const content = "MARK end";
  const tt = new TokenizedText(content);
  assertEquals(tt.captureAfterContext(4, 60), " end");
});
