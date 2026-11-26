import type { Mark } from "@essayist/core";
import { assertEquals } from "@std/assert";
import { test } from "vitest";

import { reanchorMarks } from "./resolvedMarks.ts";

const base: Mark = {
  id: "m1",
  threadId: "t1",
  path: "essay.md",
  versionId: "v1",
  selectedText: "world",
  beforeContext: "",
  afterContext: "",
  comment: "note",
  createdAt: 0,
  offset: 6,
  length: 5,
  status: "resolved",
};

test("reanchorMarks -- unchanged content returns the marks as-is", () => {
  const marks = [base];
  const out = reanchorMarks(marks, "hello world", "hello world");
  assertEquals(out === marks, true);
});

test("reanchorMarks -- shifted text remaps offsets onto the new content", () => {
  const out = reanchorMarks([base], "hello world", "hello brave world");
  assertEquals(out[0].offset, "hello brave world".indexOf("world"));
  assertEquals(out[0].selectedText, "world");
  assertEquals(out[0].status, "resolved");
});

test("reanchorMarks -- mark ids survive resolution", () => {
  const out = reanchorMarks([base], "hello world", "hello brave world");
  assertEquals(out[0].id, "m1");
  assertEquals(out[0].threadId, "t1");
});

test("reanchorMarks -- vanished text goes stale", () => {
  const out = reanchorMarks([base], "hello world", "hello there");
  assertEquals(out[0].status, "stale");
  assertEquals(out[0].length, 0);
});

test("reanchorMarks -- no marks resolves to nothing", () => {
  assertEquals(reanchorMarks([], "hello world", "hello brave world"), []);
});
