import { assertEquals, assertStrictEquals } from "@std/assert";
import { unifiedDiff } from "./unified_diff.ts";

Deno.test("unifiedDiff -- identical strings produce empty diff", () => {
  const result = unifiedDiff("same", "same");
  assertEquals(result, "");
});

Deno.test("unifiedDiff -- single line change", () => {
  const oldText = "line1\nline2\nline3";
  const newText = "line1\nmodified\nline3";
  const result = unifiedDiff(oldText, newText);
  assertStrictEquals(result.includes("-line2"), true);
  assertStrictEquals(result.includes("+modified"), true);
  assertStrictEquals(result.includes("@@"), true);
});

Deno.test("unifiedDiff -- header format", () => {
  const result = unifiedDiff("a", "b", "old.txt", "new.txt");
  assertStrictEquals(result.startsWith("--- old.txt\n+++ new.txt\n"), true);
});

Deno.test("unifiedDiff -- added lines", () => {
  const oldText = "line1\nline3";
  const newText = "line1\nline2\nline3";
  const result = unifiedDiff(oldText, newText);
  assertStrictEquals(result.includes("+line2"), true);
});

Deno.test("unifiedDiff -- deleted lines", () => {
  const oldText = "line1\nline2\nline3";
  const newText = "line1\nline3";
  const result = unifiedDiff(oldText, newText);
  assertStrictEquals(result.includes("-line2"), true);
});

Deno.test("unifiedDiff -- multiple hunks", () => {
  const oldText =
    "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nB\no\np\nq\nr\ns\nt\nu\nv\nw\nx\ny\nz";
  const newText =
    "a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr\ns\nt\nu\nv\nw\nx\ny\nz";
  const result = unifiedDiff(oldText, newText);
  assertEquals(
    result,
    [
      "--- a",
      "+++ b",
      "@@ -1,5 +1,5 @@",
      " a",
      "-b",
      "+B",
      " c",
      " d",
      " e",
      "@@ -11,7 +11,7 @@",
      " k",
      " l",
      " m",
      "-B",
      "+n",
      " o",
      " p",
      " q",
      "",
    ].join("\n"),
  );
});

Deno.test("unifiedDiff -- empty old text", () => {
  const result = unifiedDiff("", "new content");
  assertStrictEquals(result.includes("+new content"), true);
});

Deno.test("unifiedDiff -- empty new text", () => {
  const result = unifiedDiff("old content", "");
  assertStrictEquals(result.includes("-old content"), true);
});

Deno.test("unifiedDiff -- context lines present", () => {
  const oldText = "aaa\nbbb\nccc\nddd\neee";
  const newText = "aaa\nbbb\nCCC\nddd\neee";
  const result = unifiedDiff(oldText, newText);
  assertStrictEquals(result.includes(" aaa"), true);
  assertStrictEquals(result.includes(" ddd"), true);
});

Deno.test("unifiedDiff -- ends with newline", () => {
  const result = unifiedDiff("a", "b");
  assertStrictEquals(result.endsWith("\n"), true);
});

Deno.test("unifiedDiff -- both empty strings", () => {
  const result = unifiedDiff("", "");
  assertEquals(result, "");
});
