import { expect, test } from "vitest";

import { editorPath, parseEditorPath } from "./editorPath.ts";

test("builds the path from the workspace and the file path", () => {
  expect(editorPath(null, null)).toBe("/editor");
  expect(editorPath("demo-9e8603b8", null)).toBe("/editor/demo-9e8603b8");
  expect(editorPath("demo-9e8603b8", "notes/a b#1.md")).toBe(
    "/editor/demo-9e8603b8/notes/a%20b%231.md",
  );
});

test("reads back what it builds", () => {
  for (const path of ["essay.md", "notes/a b#1.md", "50%?.md"]) {
    expect(parseEditorPath(editorPath("ws", path))).toEqual({ ws: "ws", path });
  }
  expect(parseEditorPath("/editor/ws")).toEqual({ ws: "ws", path: null });
  expect(parseEditorPath("/editor/ws/")).toEqual({ ws: "ws", path: null });
  expect(parseEditorPath("/editor")).toEqual({ ws: null, path: null });
});

test("names nothing outside the editor or for a malformed escape", () => {
  expect(parseEditorPath("/editorial/ws/a.md")).toEqual({ ws: null, path: null });
  expect(parseEditorPath("/editor/ws/%E0%A4%A.md")).toEqual({ ws: null, path: null });
});
