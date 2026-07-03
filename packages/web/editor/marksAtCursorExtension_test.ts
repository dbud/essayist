import { buildEditorFromExtensions } from "@lexical/extension";
import { $isMarkNode, $wrapSelectionInMarkNode, MarkNode } from "@lexical/mark";
import { RichTextExtension } from "@lexical/rich-text";
import { assert, assertEquals } from "@std/assert";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  configExtension,
  defineExtension,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import {
  type EditorSelection,
  EditorSelectionModel,
} from "@/signals/editorSelection.ts";
import { MarksAtCursorExtension } from "./marksAtCursorExtension.ts";

const selection: EditorSelection = new EditorSelectionModel("");

const testExtension = defineExtension({
  name: "marks-at-cursor-test",
  nodes: () => [MarkNode],
  dependencies: [
    RichTextExtension,
    configExtension(MarksAtCursorExtension, { selection }),
  ],
});

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...testExtension,
    $initialEditorState: undefined,
    namespace: "marks-at-cursor-test",
  });
}

// Build "hello world" with "hello" wrapped in mark `id`.
function buildMarkedEditor(editor: LexicalEditor, id: string): void {
  editor.update(
    () => {
      $getRoot().clear();
      const text = $createTextNode("hello world");
      $getRoot().append($createParagraphNode().append(text));
      const sel = $createRangeSelection();
      sel.anchor.set(text.getKey(), 0, "text");
      sel.focus.set(text.getKey(), 5, "text");
      $wrapSelectionInMarkNode(sel, false, id);
    },
    { discrete: true },
  );
}

/**
 * Places a collapsed caret inside the first text node matching `predicate`
 * (offset 1, so it's strictly interior, not a boundary that Lexical might
 * associate with a neighbouring node).
 */
function caretIn(
  editor: LexicalEditor,
  predicate: (n: LexicalNode) => boolean,
): void {
  editor.update(
    () => {
      const node = $getRoot().getAllTextNodes().find(predicate);
      if (node) node.select(1, 1);
    },
    { discrete: true },
  );
}

Deno.test("marksAtCursor -- contains the mark id when caret is inside it", () => {
  selection.markIds.value = new Set();
  const editor = createEditor();
  buildMarkedEditor(editor, "t1");
  caretIn(editor, (n) => n.getParent() !== null && $isMarkNode(n.getParent()));

  assert(selection.markIds.value.has("t1"));
});

Deno.test("marksAtCursor -- empty when caret is outside any mark", () => {
  selection.markIds.value = new Set();
  const editor = createEditor();
  buildMarkedEditor(editor, "t2");
  caretIn(editor, (n) => n.getParent() !== null && !$isMarkNode(n.getParent()));

  assertEquals(selection.markIds.value.size, 0);
});
