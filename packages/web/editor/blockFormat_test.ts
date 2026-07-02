import { CodeNode } from "@lexical/code";
import { buildEditorFromExtensions } from "@lexical/extension";
import { ListExtension } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import { $isHeadingNode, RichTextExtension } from "@lexical/rich-text";
import { assert, assertEquals } from "@std/assert";
import {
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  defineExtension,
  type LexicalEditor,
} from "lexical";
import { $getBlockType, $setBlocksType } from "./blockFormat.ts";

const testExtension = defineExtension({
  name: "block-format-test",
  nodes: () => [CodeNode],
  dependencies: [RichTextExtension, ListExtension],
});

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...testExtension,
    $initialEditorState: undefined,
    namespace: "block-format-test",
  });
}

function importMarkdown(editor: LexicalEditor, md: string): void {
  editor.update(
    () => {
      $getRoot().clear();
      $convertFromMarkdownString(md, TRANSFORMERS);
    },
    { discrete: true },
  );
}

// Place the caret at the start of the first content block.
function caretAtStart(editor: LexicalEditor): void {
  editor.update(
    () => {
      const node = $getRoot().getFirstChild();
      if (node === null) return;
      if ($isTextNode(node)) {
        node.select(0, 0);
      } else if (
        typeof (node as { selectStart?: unknown }).selectStart === "function"
      ) {
        (node as unknown as { selectStart: () => void }).selectStart();
      }
    },
    { discrete: true },
  );
}

// Select the entire first content block's text.
function selectFirstBlockText(editor: LexicalEditor): void {
  editor.update(
    () => {
      const textNode = $getRoot().getAllTextNodes()[0];
      if (textNode) textNode.select(0, textNode.getTextContentSize());
    },
    { discrete: true },
  );
}

function blockTypeOf(editor: LexicalEditor): string {
  let result = "";
  editor.getEditorState().read(() => {
    result = $getBlockType();
  });
  return result;
}

Deno.test("$getBlockType -- paragraph", () => {
  const editor = createEditor();
  importMarkdown(editor, "hello world\n");
  caretAtStart(editor);
  assertEquals(blockTypeOf(editor), "normal");
});

Deno.test("$getBlockType -- heading", () => {
  const editor = createEditor();
  importMarkdown(editor, "# Title\n");
  caretAtStart(editor);
  assertEquals(blockTypeOf(editor), "h1");
});

Deno.test("$getBlockType -- quote", () => {
  const editor = createEditor();
  importMarkdown(editor, "> quoted\n");
  caretAtStart(editor);
  assertEquals(blockTypeOf(editor), "quote");
});

Deno.test("$getBlockType -- code block", () => {
  const editor = createEditor();
  importMarkdown(editor, "```\nlet x = 1\n```\n");
  caretAtStart(editor);
  assertEquals(blockTypeOf(editor), "code");
});

Deno.test("$getBlockType -- bullet list", () => {
  const editor = createEditor();
  importMarkdown(editor, "- one\n- two\n");
  caretAtStart(editor);
  assertEquals(blockTypeOf(editor), "bullet");
});

Deno.test("$setBlocksType -- paragraph to heading", () => {
  const editor = createEditor();
  importMarkdown(editor, "hello world\n");
  selectFirstBlockText(editor);
  editor.update(() => $setBlocksType("h1"), { discrete: true });

  let isHeading = false;
  let tag = "";
  editor.getEditorState().read(() => {
    const child = $getRoot().getFirstChild();
    if ($isHeadingNode(child)) {
      isHeading = true;
      tag = child.getTag();
    }
  });
  assert(isHeading);
  assertEquals(tag, "h1");
});

Deno.test("$setBlocksType -- heading to paragraph (toggle)", () => {
  const editor = createEditor();
  importMarkdown(editor, "# Title\n");
  selectFirstBlockText(editor);
  editor.update(() => $setBlocksType("normal"), { discrete: true });

  let isParagraph = false;
  editor.getEditorState().read(() => {
    const child = $getRoot().getFirstChild();
    isParagraph = child !== null && $isParagraphNode(child);
  });
  assert(isParagraph);
});

Deno.test("$setBlocksType -- paragraph to quote round-trips to markdown", () => {
  const editor = createEditor();
  importMarkdown(editor, "a line\n");
  selectFirstBlockText(editor);
  editor.update(() => $setBlocksType("quote"), { discrete: true });

  let exported = "";
  editor.getEditorState().read(() => {
    exported = $convertToMarkdownString(TRANSFORMERS, $getRoot());
  });
  assert(exported.startsWith("> "));
});
