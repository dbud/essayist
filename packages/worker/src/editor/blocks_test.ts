import { $createCodeNode } from "@lexical/code";
import { buildEditorFromExtensions } from "@lexical/extension";
import { $createListItemNode, $createListNode, $isListItemNode } from "@lexical/list";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { assert, assertEquals } from "@std/assert";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { test } from "vitest";

import { bootstrapEditorExtension } from "#/editor/extension.ts";

import { $leafBlockOf } from "./blocks.ts";

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...bootstrapEditorExtension,
    $initialEditorState: undefined,
    namespace: "test",
  });
}

function firstChild(node: LexicalNode | null): LexicalNode | null {
  return $isElementNode(node) ? node.getFirstChild() : null;
}

// The fixture: a paragraph, a quote with an inner paragraph, a list item whose text sits directly
// in the item, a code block, a heading, and a trailing empty paragraph. The bootstrapped root also
// starts with one empty paragraph.
function seed(editor: LexicalEditor): void {
  editor.update(
    () => {
      const root = $getRoot();
      const p1 = $createParagraphNode();
      p1.append($createTextNode("one"));

      const quote = $createQuoteNode();
      const p2 = $createParagraphNode();
      p2.append($createTextNode("two"));
      quote.append(p2);

      const list = $createListNode("bullet");
      const item = $createListItemNode();
      item.append($createTextNode("three"));
      list.append(item);

      const code = $createCodeNode();
      code.append($createTextNode("five"));

      const heading = $createHeadingNode("h2");
      heading.append($createTextNode("six"));

      root.append(p1, quote, list, code, heading, $createParagraphNode());
    },
    { discrete: true },
  );
}

test("$leafBlockOf -- resolves the nearest eligible block through containers", () => {
  const editor = createEditor();
  seed(editor);
  editor.read(() => {
    // The bootstrapped root starts with one empty paragraph, so the fixture's blocks are its
    // children at index 1..5.
    const [, p1, quote, list, code, heading] = [...$getRoot().getChildren()];
    assert($isElementNode(p1));
    assert($isElementNode(quote));
    const p2 = firstChild(quote);
    assert($isParagraphNode(p2));
    assert($isElementNode(list));
    const item = firstChild(list);
    assert($isListItemNode(item));

    assertEquals($leafBlockOf(firstChild(p1))?.getKey(), p1?.getKey());
    // The quote recurses through: the mark resolves to the inner paragraph.
    assertEquals($leafBlockOf(firstChild(p2))?.getKey(), p2?.getKey());
    // The item's mark resolves to the item itself.
    assertEquals($leafBlockOf(firstChild(item))?.getKey(), item?.getKey());
    assertEquals($leafBlockOf(firstChild(code))?.getKey(), code?.getKey());
    assertEquals($leafBlockOf(firstChild(heading))?.getKey(), heading?.getKey());
    assertEquals($leafBlockOf($getRoot()), null);
  });
});
