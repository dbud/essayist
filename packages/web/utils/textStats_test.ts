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
import {
  charCountFold,
  charCountWithSpacesFold,
  editorStateCharCount,
  editorStateCharCountWithSpaces,
  editorStateWordCount,
  wordCountFold,
} from "@/utils/textStats.ts";

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...bootstrapEditorExtension,
    $initialEditorState: undefined,
    namespace: "test-text-stats",
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

// Reference counts, recomputed independently of the folds. Words are
// alphanumeric runs optionally joined by single hyphens; character counts
// sum plain text per top-level block (block separators are not
// characters).
const WORD_REGEX = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
const NON_WS_REGEX = /\S/g;

function groundTruthWords(state: EditorState): number {
  let text = "";
  state.read(() => {
    text = $getRoot().getTextContent();
  });
  return text.match(WORD_REGEX)?.length ?? 0;
}

function groundTruthChars(state: EditorState): number {
  let n = 0;
  state.read(() => {
    for (const child of $getRoot().getChildren()) {
      const m = child.getTextContent().match(NON_WS_REGEX);
      n += m ? m.length : 0;
    }
  });
  return n;
}

function groundTruthCharsWithSpaces(state: EditorState): number {
  let n = 0;
  state.read(() => {
    for (const child of $getRoot().getChildren()) {
      n += child.getTextContent().length;
    }
  });
  return n;
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

// Fixed expectations pin the token rules: words are alphanumeric runs, so
// markdown punctuation, markers, and fences contribute nothing. Character
// counts read plain text, so syntax markers are absent there too.
Deno.test("editorStateWordCount -- fixed expectations", () => {
  const cases: Array<[string, number]> = [
    ["", 0],
    ["Hello world", 2],
    ["# Title\n\nFirst paragraph.\n\nSecond paragraph.", 5],
    ["- one\n- two", 2],
    ["> quoted words here", 3],
    ["-- just dashes ... and dots", 4],
    ["```\ncode words\n```", 2],
    ["well-known", 1],
    ["state-of-the-art design", 2],
    ["one- two-", 2],
  ];
  for (const [md, expected] of cases) {
    const editor = createEditor();
    const state = importMarkdown(editor, md);
    assertEquals(editorStateWordCount(state), expected, `for:\n${md}`);
  }
});

// [md, chars (no spaces), chars (with spaces)]
Deno.test("editorStateCharCount -- fixed expectations", () => {
  const cases: Array<[string, number, number]> = [
    ["", 0, 0],
    ["Hello world", 10, 11],
    ["# Title\n\nFirst paragraph.\n\nSecond paragraph.", 36, 38],
    ["A\n\nB", 2, 2],
    ["a  b", 2, 4],
    ["> quoted", 6, 6],
    ["```\ncode\n```", 4, 4],
  ];
  for (const [md, chars, withSpaces] of cases) {
    const editor = createEditor();
    const state = importMarkdown(editor, md);
    assertEquals(editorStateCharCount(state), chars, `for:\n${md}`);
    assertEquals(
      editorStateCharCountWithSpaces(state),
      withSpaces,
      `for:\n${md}`,
    );
  }
});

// Incremental counts must match full recomputes across a sequence of edits
// (append, insert, remove) on a single editor. This validates the shared
// dirty-block resolution and cache chaining.
Deno.test("textStats folds -- incremental matches full after edits", () => {
  const md = `# Title

First paragraph.

- Item one
- Item two

Last paragraph.`;

  const editor = createEditor();
  const initial = importMarkdown(editor, md);
  assertEquals(editorStateWordCount(initial), 9);
  assertEquals(editorStateCharCount(initial), groundTruthChars(initial));
  assertEquals(
    editorStateCharCountWithSpaces(initial),
    groundTruthCharsWithSpaces(initial),
  );

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
    for (const fold of [
      wordCountFold,
      charCountFold,
      charCountWithSpacesFold,
    ]) {
      fold.update(
        p.editorState,
        p.prevEditorState,
        p.dirtyElements,
        p.dirtyLeaves,
      );
    }
    assertEquals(
      editorStateWordCount(p.editorState),
      groundTruthWords(p.editorState),
    );
    assertEquals(
      editorStateCharCount(p.editorState),
      groundTruthChars(p.editorState),
    );
    assertEquals(
      editorStateCharCountWithSpaces(p.editorState),
      groundTruthCharsWithSpaces(p.editorState),
    );
  }
});

Deno.test("textStats folds -- unprimed prev falls back to full count", () => {
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
  for (const fold of [wordCountFold, charCountFold, charCountWithSpacesFold]) {
    fold.update(
      p.editorState,
      p.prevEditorState,
      p.dirtyElements,
      p.dirtyLeaves,
    );
  }
  assertEquals(editorStateWordCount(p.editorState), 2);
  assertEquals(
    editorStateWordCount(p.editorState),
    groundTruthWords(p.editorState),
  );
  assertEquals(editorStateCharCount(p.editorState), 11);
  assertEquals(
    editorStateCharCount(p.editorState),
    groundTruthChars(p.editorState),
  );
  assertEquals(editorStateCharCountWithSpaces(p.editorState), 12);
  assertEquals(
    editorStateCharCountWithSpaces(p.editorState),
    groundTruthCharsWithSpaces(p.editorState),
  );
});
