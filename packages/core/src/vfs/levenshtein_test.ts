import { assertEquals } from "@std/assert/equals";
import {
  levenshteinDistance,
  levenshteinSimilarity,
} from "@/vfs/levenshtein.ts";

Deno.test("levenshteinDistance -- identical strings", () => {
  assertEquals(levenshteinDistance("hello", "hello"), 0);
});

Deno.test("levenshteinDistance -- empty strings", () => {
  assertEquals(levenshteinDistance("", ""), 0);
  assertEquals(levenshteinDistance("hello", ""), 5);
  assertEquals(levenshteinDistance("", "hello"), 5);
});

Deno.test("levenshteinDistance -- single character difference", () => {
  assertEquals(levenshteinDistance("cat", "car"), 1);
  assertEquals(levenshteinDistance("cat", "cats"), 1);
  assertEquals(levenshteinDistance("cats", "cat"), 1);
});

Deno.test("levenshteinDistance -- classic example", () => {
  assertEquals(levenshteinDistance("kitten", "sitting"), 3);
});

Deno.test("levenshteinDistance -- completely different", () => {
  assertEquals(levenshteinDistance("abc", "xyz"), 3);
});

Deno.test("levenshteinDistance -- unicode", () => {
  assertEquals(levenshteinDistance("café", "cafe"), 1);
  assertEquals(levenshteinDistance("naïve", "naive"), 1);
});

Deno.test("levenshteinDistance -- long strings", () => {
  const a = "The quick brown fox jumps over the lazy dog";
  const b = "The quick brown fox jumps over the lazy cat";
  assertEquals(levenshteinDistance(a, b), 3);
});

Deno.test("levenshteinSimilarity -- identical strings", () => {
  assertEquals(levenshteinSimilarity("hello", "hello"), 1);
});

Deno.test("levenshteinSimilarity -- completely different", () => {
  assertEquals(levenshteinSimilarity("abc", "xyz"), 0);
});

Deno.test("levenshteinSimilarity -- empty strings", () => {
  assertEquals(levenshteinSimilarity("", ""), 1);
  assertEquals(levenshteinSimilarity("hello", ""), 0);
  assertEquals(levenshteinSimilarity("", "hello"), 0);
});

Deno.test("levenshteinSimilarity -- partial similarity", () => {
  const sim = levenshteinSimilarity("kitten", "sitting");
  assertEquals(sim > 0.5 && sim < 1, true);
});

Deno.test("levenshteinSimilarity -- single char change in long string", () => {
  const a = "The quick brown fox jumps over the lazy dog";
  const b = "The quick brown fox jumps over the lazy cat";
  const sim = levenshteinSimilarity(a, b);
  assertEquals(sim > 0.9, true);
});
