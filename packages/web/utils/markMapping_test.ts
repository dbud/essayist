import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { assert, assertEquals } from "@std/assert";
import { $getRoot, type LexicalEditor } from "lexical";
import editorExtension from "@/islands/editor/extension.ts";
import {
  buildMarkdownMapping,
  findPosition,
  findRange,
} from "./markMapping.ts";

function createEditor() {
  return buildEditorFromExtensions({
    ...editorExtension,
    $initialEditorState: undefined,
    namespace: "test",
  });
}

function importMarkdown(editor: LexicalEditor, md: string) {
  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(md, TRANSFORMERS);
    },
    { discrete: true },
  );
}

Deno.test("buildMarkdownMapping -- simple paragraph", () => {
  const editor = createEditor();
  importMarkdown(editor, "Hello world");

  const { spans, markdown } = buildMarkdownMapping(editor);

  assertEquals(markdown, "Hello world");
  assertEquals(spans.length, 1);
  assertEquals(spans[0].mdStart, 0);
  assertEquals(spans[0].text, "Hello world");

  const range = findRange(spans, 6, 5);
  assertEquals(range?.anchor.offset, 6);
  assertEquals(range?.focus.offset, 10);
});

Deno.test("buildMarkdownMapping -- heading syntax chars snap to nearest text", () => {
  const editor = createEditor();
  importMarkdown(editor, "# My Heading");

  const { spans } = buildMarkdownMapping(editor);
  const heading = spans.find((s) => s.text === "My Heading");

  assert(heading);
  assertEquals(heading.mdStart, 2);

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

Deno.test("buildMarkdownMapping -- bold in paragraph produces 3 text nodes", () => {
  const editor = createEditor();
  importMarkdown(editor, "This is **bold** text");

  const { spans } = buildMarkdownMapping(editor);

  assertEquals(spans.length, 3);
  assert(spans.find((s) => s.text === "bold"));
});

Deno.test("buildMarkdownMapping -- two paragraphs", () => {
  const editor = createEditor();
  importMarkdown(editor, "First.\n\nSecond.");

  const { spans } = buildMarkdownMapping(editor);

  assertEquals(spans.length, 2);
  assertEquals(spans[0].text, "First.");
  assertEquals(spans[1].text, "Second.");
});

Deno.test("buildMarkdownMapping -- mixed content all spans valid and sorted", () => {
  const editor = createEditor();
  importMarkdown(
    editor,
    `# Title

This is a paragraph with **bold** text.

## Section

- Item one
- Item two

> A blockquote

\`\`\`
code here
\`\`\``,
  );

  const { spans, markdown } = buildMarkdownMapping(editor);

  assert(spans.length >= 5);
  for (let i = 1; i < spans.length; i++) {
    assert(spans[i].mdStart >= spans[i - 1].mdStart, "spans sorted");
  }
  for (const s of spans) {
    assertEquals(
      markdown.slice(s.mdStart, s.mdStart + s.text.length),
      s.text,
      `span at ${s.mdStart} matches`,
    );
  }
});

Deno.test("findPosition -- past end snaps to last char", () => {
  const editor = createEditor();
  importMarkdown(editor, "AB");

  const { spans } = buildMarkdownMapping(editor);

  const pos0 = findPosition(spans, 0);
  const pos1 = findPosition(spans, 1);
  assert(pos0 && pos1);

  // Offset 2 is past the end (text is "AB", length 2).
  // Snaps to the last character.
  const pos2 = findPosition(spans, 2);
  assert(pos2);
  assertEquals(pos2.offset, 1);

  // Offset 99 also snaps to the last character.
  const pos99 = findPosition(spans, 99);
  assert(pos99);
  assertEquals(pos99.offset, 1);
});

Deno.test("findPosition -- gap between spans snaps forward", () => {
  const editor = createEditor();
  importMarkdown(editor, "Hello **world**");

  const { spans } = buildMarkdownMapping(editor);
  // Two spans: "Hello " at 0, "world" at 8 (after "**")
  // Offset 6 is "*" — in the gap between spans, snaps to "world" start
  const pos = findPosition(spans, 6);
  assert(pos);
  assertEquals(pos.key, spans[1].key);
  assertEquals(pos.offset, 0);
});
