import { assertEquals } from "@std/assert";
import { test } from "vitest";

import { sanitizeDocTitle } from "#/utils/googleDrive.ts";

test("sanitizeDocTitle -- appends .md suffix", () => {
  assertEquals(sanitizeDocTitle("My Draft"), "My Draft.md");
});

test("sanitizeDocTitle -- leaves .md names unchanged", () => {
  assertEquals(sanitizeDocTitle("already.md"), "already.md");
});

test("sanitizeDocTitle -- replaces path separators with dash", () => {
  assertEquals(sanitizeDocTitle("Draft/Final"), "Draft-Final.md");
  assertEquals(sanitizeDocTitle("a\\b"), "a-b.md");
});

test("sanitizeDocTitle -- replaces windows-invalid chars", () => {
  assertEquals(sanitizeDocTitle('a:b*c?d"e<f>g|h'), "a-b-c-d-e-f-g-h.md");
});

test("sanitizeDocTitle -- trims whitespace", () => {
  assertEquals(sanitizeDocTitle("  spaced  "), "spaced.md");
});

test("sanitizeDocTitle -- empty falls back to untitled", () => {
  assertEquals(sanitizeDocTitle(""), "untitled.md");
  assertEquals(sanitizeDocTitle("   "), "untitled.md");
});
