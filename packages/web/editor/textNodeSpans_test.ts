import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { assert, assertEquals } from "@std/assert";
import { $getRoot, type EditorState, type LexicalEditor } from "lexical";
import { bootstrapEditorExtension } from "@/editor/extension.ts";
import {
  $collectTextNodeSpans,
  findPosition,
  findRange,
  positionToOffset,
  type TextNodeSpan,
} from "./textNodeSpans.ts";

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...bootstrapEditorExtension,
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

// Committed-state counterpart to `$collectTextNodeSpans` for tests outside an
// update. Takes the already-exported markdown.
function buildTextNodeSpans(
  state: EditorState,
  content: string,
): TextNodeSpan[] {
  return state.read(() => $collectTextNodeSpans(content));
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

// The export escapes `* _ ` ~ \` as `\X` inside non-code text nodes. A bare
// `indexOf(textNodeText)` fails when the node contains one of those chars, so
// the node would be dropped from the span list. These cover the pre-escape
// path and the code-context (verbatim) path.

Deno.test("buildTextNodeSpans -- literal escaped asterisk in prose is found", () => {
  // md "a\*b" imports as one text node "a*b" (literal *); export re-escapes to
  // "a\*b". A bare indexOf("a*b") would fail and drop the node.
  const md = "a\\*b";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  assertEquals(spans.length, 1);
  assertEquals(spans[0].text, "a*b");
  assertEquals(spans[0].offset, 0);
});

Deno.test("buildTextNodeSpans -- multi-char prose with * is not dropped", () => {
  // md "before \* after" imports as one text node "before * after" (literal *);
  // export re-escapes to "before \* after". A bare indexOf("before * after")
  // would fail and drop the node.
  const md = "before \\* after";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  assertEquals(spans.length, 1);
  assertEquals(spans[0].text, "before * after");
  assertEquals(spans[0].offset, 0);
  // content "before \* after": the `*` is at content offset 8 (the `\` at 7
  // is its escape prefix, invisible in the editor). A length-1 mark on the
  // visible `*` (content [8,9)) wraps editor char [7,8) -- the `*` itself.
  const range = findRange(spans, { offset: 8, length: 1 });
  assert(range);
  assertEquals(range.anchor.key, spans[0].key);
  assertEquals(range.anchor.offset, 7);
  assertEquals(range.focus.offset, 8);
});

// The export's `\X` escapes consume a content index with no editor char. Marks
// whose content range includes those escapes must map to editor offsets by
// walking the escape, not by plain subtraction. These cover the reported bug
// (content offset 4 in "a\*b" mapping to editor offset 4 instead of 3).

Deno.test("findPosition -- escape span: content offset maps to editor offset via `X` walk", () => {
  // content "a\*b" (length 4) -- editor text node "a*b" (length 3).
  // content offsets: a=0, \=1, *=2, b=3.
  const md = "a\\*b";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  assertEquals(spans.length, 1);
  assertEquals(spans[0].text, "a*b");
  // The span stores the markdown-space form it matched in the export.
  assertEquals(spans[0].markdown, "a\\*b");

  // Content offset 3 (at `b`) -> editor offset 2 (before `b`), not 3.
  const atB = findPosition(spans, 3);
  assert(atB);
  assertEquals(atB.offset, 2);

  // Content offset 4 (after `b`) -> editor offset 3 (caret after last char).
  const afterB = findPosition(spans, 4);
  assert(afterB);
  assertEquals(afterB.offset, 3);
});

Deno.test("findRange -- mark covering content `a*` wraps editor `a*` not `a*b`", () => {
  // The reported bug: a mark at content [0,3) ("a\*") wrapped editor [0,3)
  // ("a*b", the whole node) because the `\` escape was ignored. The wrap must
  // cover editor [0,2) ("a*").
  const md = "a\\*b";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  const range = findRange(spans, { offset: 0, length: 3 });
  assert(range);
  assertEquals(range.anchor.offset, 0);
  assertEquals(range.focus.offset, 2);
});

Deno.test("findPosition -- escape at start of node", () => {
  // content "x**y**\*": the literal `*` node has text "*" and its content form
  // is "\*", so span.offset = 6 (the `\`, where the escaped form begins in
  // the export). Content offsets 6 (the `\`) and 7 (the `*`) both map to
  // editor offset 0 (before `*`) -- the `\` has no editor char of its own.
  const md = "x**y**\\*";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  const star = spans.find((s) => s.text === "*");
  assert(star, "literal `*` node should be tracked");
  assertEquals(star.offset, 6);
  assertEquals(star.markdown, "\\*");

  // Content offset 7 (at the `*`) -> editor offset 0 (before `*`).
  const pos = findPosition(spans, 7);
  assert(pos);
  assertEquals(pos.key, star.key);
  assertEquals(pos.offset, 0);
});

Deno.test("positionToOffset -- escape span round-trips caret through content space", () => {
  // For every editor offset in "a*b", positionToOffset -> findPosition must
  // return the same editor offset. The `\*` escape means content offsets are
  // denser than editor offsets, so the inverse must skip the `\`.
  const md = "a\\*b";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  const span = spans[0];
  for (let editor = 0; editor <= span.text.length; editor++) {
    const content = positionToOffset(spans, { key: span.key, offset: editor });
    assert(content !== null, `editor ${editor} should resolve`);
    const back = findPosition(spans, content);
    assert(back, `content ${content} should resolve`);
    assertEquals(back.key, span.key, `editor ${editor} round-trips key`);
    assertEquals(back.offset, editor, `editor ${editor} round-trips offset`);
  }
});

Deno.test("positionToOffset -- caret before `*` maps to content offset of `*`, not ``", () => {
  // Editor offset 1 (before `*`) is content offset 2 (at `*`), not 1 (at `\`).
  // The `\` is invisible; the caret belongs to the visible char it escapes.
  const md = "a\\*b";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  const span = spans[0];
  const content = positionToOffset(spans, { key: span.key, offset: 1 });
  assertEquals(content, 2);
});

Deno.test("buildTextNodeSpans -- literal * after bold matches the \\* form, not the bold marker", () => {
  // content "x**y**\*" -- the literal "*" (\*) begins at offset 6; the bold
  // close markers are at 4-5. A bare indexOf("*", 4) would land on the bold
  // close (4); the pre-escaped needle "\*" lands on the literal at 6.
  const md = "x**y**\\*";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  // Spans: "x" at 0, "y" at 3, "*" (literal) at 6.
  assertEquals(
    spans.map((s) => s.text),
    ["x", "y", "*"],
  );
  assertEquals(spans[2].offset, 6);
});

Deno.test("buildTextNodeSpans -- inline code with * stays verbatim (raw)", () => {
  // Code is emitted raw (no escaping): content is "`a*b`".
  const md = "`a*b`";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  assertEquals(spans.length, 1);
  assertEquals(spans[0].text, "a*b");
  assertEquals(spans[0].offset, 1);
});

Deno.test("buildTextNodeSpans -- block code with * stays verbatim (raw)", () => {
  const md = "```\na*b\n```";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  const span = spans.find((s) => s.text === "a*b");
  assert(span, "code-highlight text node should be found, not dropped");
});

Deno.test("buildTextNodeSpans -- literal backslash in prose", () => {
  // md "a\\b" (markdown "a\\b") imports as "a\b"; export re-escapes to "a\\b"
  // (a literal backslash is `\\` in the content form). The node is tracked and
  // the `\\` escape is walked so offsets round-trip.
  const md = "a\\\\b";
  const spans = buildTextNodeSpans(importMarkdown(md), md);
  assertEquals(spans.length, 1);
  assertEquals(spans[0].text, "a\\b");
  assertEquals(spans[0].markdown, "a\\\\b");
  assertEquals(spans[0].offset, 0);
});

Deno.test("buildTextNodeSpans -- literal underscore / backtick / tilde in prose", () => {
  for (const ch of ["_", "`", "~"]) {
    const md = `a${ch}b`.replace(/[_`~]/g, (c) => `\\${c}`);
    // e.g. "a\_b", "a\`b", "a\~b"
    const spans = buildTextNodeSpans(importMarkdown(md), md);
    assertEquals(spans.length, 1, `node with ${ch} should not be dropped`);
    assertEquals(spans[0].text, `a${ch}b`);
    assertEquals(spans[0].offset, 0);
  }
});
