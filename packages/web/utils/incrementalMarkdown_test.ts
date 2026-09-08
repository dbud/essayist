import { buildEditorFromExtensions } from "@lexical/extension";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { assert, assertEquals } from "@std/assert";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  type EditorState,
  type LexicalEditor,
  type UpdateListenerPayload,
} from "lexical";
import { bootstrapEditorExtension } from "@/editor/extension.ts";
import {
  editorStateToMarkdown,
  markdownFold,
} from "@/utils/incrementalMarkdown.ts";

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...bootstrapEditorExtension,
    $initialEditorState: undefined,
    namespace: "test",
  });
}

function importMarkdown(editor: LexicalEditor, md: string): EditorState {
  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(md, TRANSFORMERS);
    },
    { discrete: true },
  );
  return editor.getEditorState();
}

function groundTruth(state: EditorState): string {
  let out = "";
  state.read(() => {
    out = $convertToMarkdownString(TRANSFORMERS, $getRoot());
  });
  return out;
}

// Run an edit and capture the update payload (dirty sets + prev/next states).
function applyEdit(
  editor: LexicalEditor,
  fn: () => void,
): UpdateListenerPayload {
  let payload: UpdateListenerPayload | null = null;
  const off = editor.registerUpdateListener((p) => {
    payload = p;
  });
  editor.update(fn, { discrete: true });
  off();
  if (!payload) throw new Error("update listener did not fire");
  return payload;
}

// Restore a previous state wholesale (the undo path): setEditorState with
// its captured update payload.
function applyRestore(
  editor: LexicalEditor,
  state: EditorState,
): UpdateListenerPayload {
  let payload: UpdateListenerPayload | null = null;
  const off = editor.registerUpdateListener((p) => {
    payload = p;
  });
  editor.setEditorState(state);
  off();
  if (!payload) throw new Error("update listener did not fire");
  return payload;
}

// `editorStateToMarkdown` (via the per-block serialize + join monoid) must
// reproduce Lexical's `$convertToMarkdownString` exactly for a variety of
// documents. This is the core check that the per-block wrapper + monoid
// concatenation match the reference implementation.
Deno.test("editorStateToMarkdown -- matches full export for varied docs", () => {
  const cases = [
    "Hello world",
    "# Title\n\nFirst paragraph.\n\nSecond paragraph.",
    "# Title\n\n- Item one\n- Item two\n\n> A quote\n\n```\ncode\n```",
    "A\n\nB", // two non-empty paragraphs (double-newline join)
  ];
  for (const md of cases) {
    const editor = createEditor();
    const state = importMarkdown(editor, md);
    assertEquals(
      editorStateToMarkdown(state),
      groundTruth(state),
      `mismatch for:\n${md}`,
    );
  }
});

// An empty paragraph between two non-empty ones exercises the single-vs-double
// newline join branch (isEmptyParagraph).
Deno.test("editorStateToMarkdown -- empty paragraph join separators", () => {
  const editor = createEditor();
  editor.update(
    () => {
      $getRoot().clear();
      $getRoot().append(
        $createParagraphNode().append($createTextNode("A")),
        $createParagraphNode(),
        $createParagraphNode().append($createTextNode("B")),
      );
    },
    { discrete: true },
  );
  const state = editor.getEditorState();
  assertEquals(editorStateToMarkdown(state), groundTruth(state));
});

// Incremental updates must stay byte-identical to the full export across a
// sequence of edits (append, insert, remove) on a single editor. This
// validates the dirty-block resolution and cache chaining.
Deno.test("markdownFold -- incremental matches full after edits", () => {
  const md = `# Title

First paragraph.

- Item one
- Item two

Last paragraph.`;

  const editor = createEditor();
  const initial = importMarkdown(editor, md);
  assertEquals(editorStateToMarkdown(initial), groundTruth(initial));

  const edits: Array<() => void> = [
    // Append to the heading text.
    () => {
      const first = $getRoot().getFirstChild();
      if ($isElementNode(first)) {
        const text = first.getFirstChild();
        if ($isTextNode(text)) text.setTextContent(`${text.getTextContent()}!`);
      }
    },
    // Append a new paragraph at the end.
    () => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode("New paragraph")),
      );
    },
    // Remove the last child.
    () => {
      $getRoot().getLastChild()?.remove();
    },
    // Insert an empty paragraph after the first child (join edge case).
    () => {
      $getRoot().getFirstChild()?.insertAfter($createParagraphNode());
    },
  ];

  for (const fn of edits) {
    const p = applyEdit(editor, fn);
    markdownFold.update(
      p.editorState,
      p.prevEditorState,
      p.dirtyElements,
      p.dirtyLeaves,
    );
    assertEquals(
      editorStateToMarkdown(p.editorState),
      groundTruth(p.editorState),
    );
  }
});

Deno.test("markdownFold -- unprimed prev falls back to full serialize", () => {
  const editor = createEditor();
  importMarkdown(editor, "Hello.");
  const p = applyEdit(editor, () => {
    const first = $getRoot().getFirstChild();
    if ($isElementNode(first)) {
      const text = first.getFirstChild();
      if ($isTextNode(text))
        text.setTextContent(`${text.getTextContent()} world`);
    }
  });
  markdownFold.update(
    p.editorState,
    p.prevEditorState,
    p.dirtyElements,
    p.dirtyLeaves,
  );
  assertEquals(
    editorStateToMarkdown(p.editorState),
    groundTruth(p.editorState),
  );
});

// Selection-only commits pass empty dirty sets (no content changed), so
// carrying the previous aggregate forward is valid and keeps caret movement
// off the full-serialize path.
Deno.test("markdownFold -- selection-only commits carry the fold forward", () => {
  const editor = createEditor();
  importMarkdown(editor, "hello");
  const p = applyEdit(editor, () => {
    const text = $getRoot().getAllTextNodes()[0];
    text.select(0, 0);
  });
  assertEquals(p.dirtyElements.size, 0);
  assertEquals(p.dirtyLeaves.size, 0);
  markdownFold.update(
    p.editorState,
    p.prevEditorState,
    p.dirtyElements,
    p.dirtyLeaves,
  );
  assertEquals(
    editorStateToMarkdown(p.editorState),
    groundTruth(p.editorState),
  );
});

// Undo restores the previous state via setEditorState. Lexical reports such
// whole-state replaces with only `root` in dirtyElements and no dirty
// leaves, while the content can differ arbitrarily from the previous state.
// The fold must not carry the previous content forward in that case.
Deno.test("markdownFold -- undo restore folds the restored content", () => {
  const editor = createEditor();
  const restored = importMarkdown(editor, "hello");

  // One character typed on top: normal update, incremental fold tracks it.
  const p1 = applyEdit(editor, () => {
    const text = $getRoot().getAllTextNodes()[0];
    text.setTextContent("hello!");
  });
  markdownFold.update(
    p1.editorState,
    p1.prevEditorState,
    p1.dirtyElements,
    p1.dirtyLeaves,
  );
  assertEquals(
    editorStateToMarkdown(p1.editorState),
    groundTruth(p1.editorState),
  );

  // The restore changed the content for real -- it is not a selection
  // no-op.
  const p2 = applyRestore(editor, restored);
  assertEquals(groundTruth(p2.editorState), groundTruth(restored));
  assert(p2.dirtyElements.has("root"));
  assertEquals(p2.dirtyLeaves.size, 0);

  markdownFold.update(
    p2.editorState,
    p2.prevEditorState,
    p2.dirtyElements,
    p2.dirtyLeaves,
  );
  assertEquals(
    editorStateToMarkdown(p2.editorState),
    groundTruth(p2.editorState),
  );
});
