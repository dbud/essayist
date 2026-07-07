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
