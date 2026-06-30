import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { assert, assertEquals } from "@std/assert";
import { $getRoot, type EditorState, type LexicalEditor } from "lexical";
import editorExtension from "@/islands/editor/extension.ts";
import {
  buildTextNodeSpans,
  findPosition,
  findRange,
} from "./textNodeMapping.ts";

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...editorExtension,
    $initialEditorState: undefined,
    namespace: "test",
  });
}

function importMarkdown(md: string): EditorState {
  const editor = createEditor();
  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(md, TRANSFORMERS);
    },
    { discrete: true },
  );
  return editor.getEditorState();
}

Deno.test("buildTextNodeSpans -- simple paragraph", () => {
  const md = "Hello world";
  const spans = buildTextNodeSpans(importMarkdown(md), md);

  assertEquals(spans.length, 1);
  assertEquals(spans[0].offset, 0);
  assertEquals(spans[0].text, "Hello world");

  const range = findRange(spans, { offset: 6, length: 5 });
  assertEquals(range?.anchor.offset, 6);
  assertEquals(range?.focus.offset, 11);
});

Deno.test("buildTextNodeSpans -- heading syntax chars snap to nearest text", () => {
  const md = "# My Heading";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  const heading = spans.find((s) => s.text === "My Heading");

  assert(heading);
  assertEquals(heading.offset, 2);

  // Offset 0 ("#") and 1 (" ") are in the gap before the heading text.
  // They snap to the start of the first span.
  const pos0 = findPosition(spans, 0);
  assert(pos0);
  assertEquals(pos0.key, heading.key);
  assertEquals(pos0.offset, 0);

  const pos1 = findPosition(spans, 1);
  assert(pos1);
  assertEquals(pos1.key, heading.key);
  assertEquals(pos1.offset, 0);

  // Offset 2 is "M" — directly in the span
  const pos2 = findPosition(spans, 2);
  assert(pos2);
  assertEquals(pos2.key, heading.key);
  assertEquals(pos2.offset, 0);
});

Deno.test("buildTextNodeSpans -- bold in paragraph produces 3 text nodes", () => {
  const md = "This is **bold** text";
  const spans = buildTextNodeSpans(importMarkdown(md), md);

  assertEquals(spans.length, 3);
  assert(spans.find((s) => s.text === "bold"));
});

Deno.test("buildTextNodeSpans -- two paragraphs", () => {
  const md = "First.\n\nSecond.";
  const spans = buildTextNodeSpans(importMarkdown(md), md);

  assertEquals(spans.length, 2);
  assertEquals(spans[0].text, "First.");
  assertEquals(spans[1].text, "Second.");
});

Deno.test("buildTextNodeSpans -- mixed content all spans valid and sorted", () => {
  const md = `# Title

This is a paragraph with **bold** text.

## Section

- Item one
- Item two

> A blockquote

\`\`\`
code here
\`\`\``;

  const spans = buildTextNodeSpans(importMarkdown(md), md);

  assert(spans.length >= 5);
  for (let i = 1; i < spans.length; i++) {
    assert(spans[i].offset >= spans[i - 1].offset, "spans sorted");
  }
  for (const s of spans) {
    assertEquals(
      md.slice(s.offset, s.offset + s.text.length),
      s.text,
      `span at ${s.offset} matches`,
    );
  }
});

Deno.test("findRange -- focus is exclusive (one past last char)", () => {
  const md = "ABCDEF";
  const spans = buildTextNodeSpans(importMarkdown(md), md);

  // Select "CDE" — offset 2, length 3.
  // Anchor at 2 ("C"), focus at 5 (one past "E").
  const range = findRange(spans, { offset: 2, length: 3 });
  assert(range);
  assertEquals(range.anchor.offset, 2);
  assertEquals(range.focus.offset, 5);
});

Deno.test("findPosition -- past end snaps to caret after last char", () => {
  const md = "AB";
  const spans = buildTextNodeSpans(importMarkdown(md), md);

  const pos0 = findPosition(spans, 0);
  const pos1 = findPosition(spans, 1);
  assert(pos0 && pos1);

  // Offset 2 is exactly the text length — caret after last char.
  const pos2 = findPosition(spans, 2);
  assert(pos2);
  assertEquals(pos2.offset, 2);

  // Offset 99 is past the end — snaps to caret after last char.
  const pos99 = findPosition(spans, 99);
  assert(pos99);
  assertEquals(pos99.offset, 2);
});

Deno.test("findPosition -- gap between spans snaps to end of preceding span", () => {
  const md = "Hello **world**";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  // Two spans: "Hello " at 0, "world" at 8 (after "**")
  // Offset 6 is "*" — in the gap between spans.
  // Snaps to end of "Hello " (offset 6), staying in the same TextNode.
  const pos = findPosition(spans, 6);
  assert(pos);
  assertEquals(pos.key, spans[0].key);
  assertEquals(pos.offset, 6);
});

Deno.test("findPosition -- gap between spans snaps forward", () => {
  const md = "Hello **world**";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  // Two spans: "Hello " at 0, "world" at 8 (after "**")
  // Offset 7 is "*" — in the gap between spans, past end of "Hello ".
  // Snaps to start of next span.
  const pos = findPosition(spans, 7);
  assert(pos);
  assertEquals(pos.key, spans[1].key);
  assertEquals(pos.offset, 0);
});
