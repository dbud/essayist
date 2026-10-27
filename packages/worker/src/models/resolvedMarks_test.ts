import type { Mark } from "@essayist/core";
import { assertEquals } from "@std/assert";
import { test } from "vitest";
import { reanchorMarks } from "./resolvedMarks.ts";

const base: Mark = {
  id: "m1",
  thread_id: "t1",
  path: "essay.md",
  version_id: "v1",
  selected_text: "world",
  before_context: "",
  after_context: "",
  comment: "note",
  created_at: 0,
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
  assertEquals(out[0].selected_text, "world");
  assertEquals(out[0].status, "resolved");
});

test("reanchorMarks -- mark ids survive resolution", () => {
  const out = reanchorMarks([base], "hello world", "hello brave world");
  assertEquals(out[0].id, "m1");
  assertEquals(out[0].thread_id, "t1");
});

test("reanchorMarks -- vanished text goes stale", () => {
  const out = reanchorMarks([base], "hello world", "hello there");
  assertEquals(out[0].status, "stale");
  assertEquals(out[0].length, 0);
});

test("reanchorMarks -- no marks resolves to nothing", () => {
  assertEquals(reanchorMarks([], "hello world", "hello brave world"), []);
});
