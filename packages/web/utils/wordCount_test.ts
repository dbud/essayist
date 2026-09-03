import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { assertEquals } from "@std/assert";
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
import { editorStateWordCount, wordCountFold } from "@/utils/wordCount.ts";

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...bootstrapEditorExtension,
    $initialEditorState: undefined,
    namespace: "test-word-count",
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

// Reference count: the same token rule applied to the document's plain text.
const WORD_REGEX = /[\p{L}\p{N}]+/gu;

function groundTruth(state: EditorState): number {
  let text = "";
  state.read(() => {
    text = $getRoot().getTextContent();
  });
  return text.match(WORD_REGEX)?.length ?? 0;
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

// Fixed expectations pin the token rule: words are alphanumeric runs, so
// markdown punctuation, markers, and fences contribute nothing.
Deno.test("editorStateWordCount -- fixed expectations", () => {
  const cases: Array<[string, number]> = [
    ["", 0],
    ["Hello world", 2],
    ["# Title\n\nFirst paragraph.\n\nSecond paragraph.", 5],
    ["- one\n- two", 2],
    ["> quoted words here", 3],
    ["-- just dashes ... and dots", 4],
    ["```\ncode words\n```", 2],
  ];
  for (const [md, expected] of cases) {
    const editor = createEditor();
    const state = importMarkdown(editor, md);
    assertEquals(editorStateWordCount(state), expected, `for:\n${md}`);
  }
});

// Incremental counts must match a full recount across a sequence of edits
// (append, insert, remove) on a single editor. This validates the shared
// dirty-block resolution and cache chaining.
Deno.test("wordCountFold -- incremental matches full after edits", () => {
  const md = `# Title

First paragraph.

- Item one
- Item two

Last paragraph.`;

  const editor = createEditor();
  const initial = importMarkdown(editor, md);
  assertEquals(editorStateWordCount(initial), 9);
  assertEquals(editorStateWordCount(initial), groundTruth(initial));

  const edits: Array<() => void> = [
    // Append to the heading text (same words, longer token).
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
    // Insert an empty paragraph after the first child.
    () => {
      $getRoot().getFirstChild()?.insertAfter($createParagraphNode());
    },
  ];

  for (const fn of edits) {
    const p = applyEdit(editor, fn);
    wordCountFold.update(
      p.editorState,
      p.prevEditorState,
      p.dirtyElements,
      p.dirtyLeaves,
    );
    assertEquals(
      editorStateWordCount(p.editorState),
      groundTruth(p.editorState),
    );
  }
});

Deno.test("wordCountFold -- unprimed prev falls back to full count", () => {
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
  wordCountFold.update(
    p.editorState,
    p.prevEditorState,
    p.dirtyElements,
    p.dirtyLeaves,
  );
  assertEquals(editorStateWordCount(p.editorState), 2);
  assertEquals(editorStateWordCount(p.editorState), groundTruth(p.editorState));
});
