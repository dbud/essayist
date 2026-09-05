import { buildEditorFromExtensions } from "@lexical/extension";
import { $isMarkNode, MarkNode } from "@lexical/mark";
import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { RichTextExtension } from "@lexical/rich-text";
import { assert, assertEquals } from "@std/assert";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  configExtension,
  defineExtension,
  IS_ITALIC,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { $applyMarks } from "./markExtension.ts";
import { $restoreSelection, $saveSelection } from "./selection.ts";
import { $collectTextNodeSpans, type TextNodeSpan } from "./textNodeSpans.ts";

// Minimal extension that just contributes MarkNode.
const MarkNodeOnly = defineExtension({
  name: "mark-node-only",
  nodes: () => [MarkNode],
});

// Registers MarkNode + RichText without the apply effect, so the test can
// drive $applyMarks directly with controlled spans.
const testExtension = defineExtension({
  name: "mark-apply-test",
  dependencies: [RichTextExtension, configExtension(MarkNodeOnly)],
});

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...testExtension,
    $initialEditorState: undefined,
    namespace: "mark-apply-test",
  });
}

/** One paragraph with the given text. */
function setParagraph(editor: LexicalEditor, text: string): void {
  editor.update(
    () => {
      $getRoot().clear();
      $getRoot().append($createParagraphNode().append($createTextNode(text)));
    },
    { discrete: true },
  );
}

/** Two paragraphs. */
function setParagraphs(editor: LexicalEditor, a: string, b: string): void {
  editor.update(
    () => {
      $getRoot().clear();
      $getRoot().append(
        $createParagraphNode().append($createTextNode(a)),
        $createParagraphNode().append($createTextNode(b)),
      );
    },
    { discrete: true },
  );
}

interface MarkFragment {
  ids: string[];
  text: string;
}

/** Collects MarkNode fragments in tree order with their id-set and text. */
function collectMarkFragments(editor: LexicalEditor): MarkFragment[] {
  const out: MarkFragment[] = [];
  editor.getEditorState().read(() => {
    function walk(node: LexicalNode): void {
      if ($isMarkNode(node)) {
        out.push({ ids: node.getIDs(), text: node.getTextContent() });
      }
      if ($isElementNode(node)) {
        for (const child of node.getChildren()) walk(child);
      }
    }
    walk($getRoot());
  });
  return out;
}

function exportMarkdown(editor: LexicalEditor): string {
  let md = "";
  editor.getEditorState().read(() => {
    md = $convertToMarkdownString(TRANSFORMERS, $getRoot());
  });
  return md;
}

function collectSpans(editor: LexicalEditor, content: string): TextNodeSpan[] {
  let spans: TextNodeSpan[] = [];
  editor.getEditorState().read(() => {
    spans = $collectTextNodeSpans(content);
  });
  return spans;
}

/** Collects the keys of every MarkNode currently in the tree. */
function collectMarkKeys(editor: LexicalEditor): Set<string> {
  const keys = new Set<string>();
  editor.getEditorState().read(() => {
    function walk(node: LexicalNode): void {
      if ($isMarkNode(node)) keys.add(node.getKey());
      if ($isElementNode(node)) {
        for (const child of node.getChildren()) walk(child);
      }
    }
    walk($getRoot());
  });
  return keys;
}

/**
 * Runs $applyMarks inside an editor update with a fresh span collection (the
 * same shape the real effect uses), tracking existing MarkNode keys so a
 * re-apply unwraps the previous fragments. Returns the resulting fragments.
 */
function applyAndCollect(
  editor: LexicalEditor,
  marks: ReadonlyArray<{ offset: number; length: number; thread_id: string }>,
): MarkFragment[] {
  const content = exportMarkdown(editor);
  const spans = collectSpans(editor, content);
  const nodeKeys = collectMarkKeys(editor);
  editor.update(
    () => {
      $applyMarks(marks, nodeKeys, spans);
    },
    { discrete: true },
  );
  return collectMarkFragments(editor);
}

Deno.test("$applyMarks -- non-overlapping marks wrap separately", () => {
  const editor = createEditor();
  setParagraph(editor, "AAAAABBBBBCCCCC");
  // "AAAAA" and "CCCCC", gap in the middle.
  const fragments = applyAndCollect(editor, [
    { offset: 0, length: 5, thread_id: "a" },
    { offset: 10, length: 5, thread_id: "c" },
  ]);
  assertEquals(fragments, [
    { ids: ["a"], text: "AAAAA" },
    { ids: ["c"], text: "CCCCC" },
  ]);
});

Deno.test("$applyMarks -- partial overlap produces a shared multi-id fragment", () => {
  const editor = createEditor();
  setParagraph(editor, "AAAAABBBBBCCCCC");
  // a: [0,8) "AAAAABBB", b: [5,10) "BBBBB" -> overlap on "BBB" [5,8).
  const fragments = applyAndCollect(editor, [
    { offset: 0, length: 8, thread_id: "a" },
    { offset: 5, length: 5, thread_id: "b" },
  ]);
  assertEquals(fragments, [
    { ids: ["a"], text: "AAAAA" },
    { ids: ["a", "b"], text: "BBB" },
    { ids: ["b"], text: "BB" },
  ]);
});

Deno.test("$applyMarks -- fully nested mark splits the outer into three fragments", () => {
  const editor = createEditor();
  setParagraph(editor, "AAAAABBBBBCCCCC");
  // outer: [0,10) "AAAAABBBBB", inner: [5,10) "BBBBB" (fully inside outer).
  const fragments = applyAndCollect(editor, [
    { offset: 0, length: 10, thread_id: "outer" },
    { offset: 5, length: 5, thread_id: "inner" },
  ]);
  assertEquals(fragments, [
    { ids: ["outer"], text: "AAAAA" },
    { ids: ["outer", "inner"], text: "BBBBB" },
  ]);
  // "CCCCC" is outside both marks and stays unwrapped.
  assertEquals(fragments.map((f) => f.text).join(""), "AAAAABBBBB");
});

Deno.test("$applyMarks -- identical spans share one fragment with both ids", () => {
  const editor = createEditor();
  setParagraph(editor, "AAAAABBBBBCCCCC");
  const fragments = applyAndCollect(editor, [
    { offset: 0, length: 5, thread_id: "a" },
    { offset: 0, length: 5, thread_id: "b" },
  ]);
  assertEquals(fragments, [{ ids: ["a", "b"], text: "AAAAA" }]);
});

Deno.test("$applyMarks -- multi-paragraph mark yields one fragment per paragraph", () => {
  const editor = createEditor();
  setParagraphs(editor, "Para one.", "Para two.");
  // exported markdown: "Para one.\n\nPara two." -> "Para one." at 0 (len 9),
  // "Para two." at 11 (len 9). Mark covers [0,20): both paragraphs.
  const fragments = applyAndCollect(editor, [
    { offset: 0, length: 20, thread_id: "m" },
  ]);
  assertEquals(fragments, [
    { ids: ["m"], text: "Para one." },
    { ids: ["m"], text: "Para two." },
  ]);
});

Deno.test("$applyMarks -- overlap across a paragraph boundary", () => {
  const editor = createEditor();
  setParagraphs(editor, "Para one.", "Para two.");
  // m1 spans both paragraphs [0,20); m2 sits in the first paragraph [0,5).
  // Segments: [0,5){m1,m2}, [5,20){m1}. The second segment crosses into para 2
  // and produces two fragments.
  const fragments = applyAndCollect(editor, [
    { offset: 0, length: 20, thread_id: "m1" },
    { offset: 0, length: 5, thread_id: "m2" },
  ]);
  assertEquals(fragments, [
    { ids: ["m1", "m2"], text: "Para " },
    { ids: ["m1"], text: "one." },
    { ids: ["m1"], text: "Para two." },
  ]);
});

Deno.test("$applyMarks -- re-applying unwraps previous marks before wrapping", () => {
  const editor = createEditor();
  setParagraph(editor, "AAAAABBBBBCCCCC");
  applyAndCollect(editor, [{ offset: 0, length: 5, thread_id: "a" }]);
  // Apply again with a different mark set; the old "a" fragment must be gone.
  const fragments = applyAndCollect(editor, [
    { offset: 10, length: 5, thread_id: "c" },
  ]);
  assertEquals(fragments, [{ ids: ["c"], text: "CCCCC" }]);
});

Deno.test("$restoreSelection -- collapsed caret keeps its toggled format across a re-mark", () => {
  const editor = createEditor();
  setParagraph(editor, "AAAAABBBBBCCCCC");

  // Collapsed caret at offset 5 with italic toggled on the selection only.
  editor.update(
    () => {
      const node = $getRoot().getAllTextNodes()[0];
      node.select(5, 5);
      const sel = $getSelection();
      assert($isRangeSelection(sel));
      sel.setFormat(IS_ITALIC);
    },
    { discrete: true },
  );

  // The re-mark update: save, re-wrap "CCCCC", restore (the real effect).
  const content = exportMarkdown(editor);
  const spans = collectSpans(editor, content);
  const nodeKeys = collectMarkKeys(editor);
  editor.update(
    () => {
      const saved = $saveSelection(spans);
      $applyMarks([{ offset: 10, length: 5, thread_id: "c" }], nodeKeys, spans);
      $restoreSelection(saved, content);
    },
    { discrete: true },
  );

  assertEquals(collectMarkFragments(editor), [{ ids: ["c"], text: "CCCCC" }]);

  let anchorOffset = -1;
  let italic = false;
  editor.getEditorState().read(() => {
    const sel = $getSelection();
    if (!$isRangeSelection(sel)) return;
    anchorOffset = sel.anchor.offset;
    italic = sel.hasFormat("italic");
  });
  // Caret still at markdown offset 5, still typing italic.
  assertEquals(anchorOffset, 5);
  assert(italic);
});
