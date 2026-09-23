import { $insertDataTransferForRichText } from "@lexical/clipboard";
import { buildEditorFromExtensions } from "@lexical/extension";
import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { RichTextExtension } from "@lexical/rich-text";
import { assertEquals } from "@std/assert";
import { $getRoot, defineExtension, type LexicalEditor } from "lexical";
import { PastePolicyExtension } from "./pastePolicyExtension.ts";

const testExtension = defineExtension({
  name: "paste-policy-test",
  dependencies: [RichTextExtension, PastePolicyExtension],
});

function createEditor(): LexicalEditor {
  return buildEditorFromExtensions({
    ...testExtension,
    $initialEditorState: undefined,
    namespace: "paste-policy-test",
  });
}

function markdownOf(editor: LexicalEditor): string {
  let result = "";
  editor.getEditorState().read(() => {
    result = $convertToMarkdownString(TRANSFORMERS);
  });
  return result;
}

function fakeDataTransfer(payload: Record<string, string>): DataTransfer {
  return {
    getData: (mime: string) => payload[mime] ?? "",
  } as unknown as DataTransfer;
}

Deno.test("json paste middleware sanitizes and inserts", () => {
  const editor = createEditor();
  const payload = JSON.stringify({
    namespace: "paste-policy-test",
    nodes: [
      {
        type: "paragraph",
        children: [
          {
            type: "mark",
            ids: ["thread-1"],
            children: [
              {
                type: "text",
                format: 129,
                style: "color:red",
                detail: 0,
                mode: "normal",
                text: "hi",
              },
            ],
          },
        ],
        direction: null,
        format: "",
        indent: 2,
        textFormat: 0,
        textStyle: "",
      },
      {
        type: "heading",
        tag: "h4",
        children: [
          {
            type: "text",
            format: 0,
            detail: 0,
            mode: "normal",
            style: "",
            text: "sub",
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
      },
      {
        type: "link",
        url: "http://x.com",
        children: [
          {
            type: "text",
            format: 1,
            detail: 0,
            mode: "normal",
            style: "",
            text: "go",
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
      },
      { type: "horizontalrule" },
    ],
  });
  editor.update(
    () => {
      $insertDataTransferForRichText(
        fakeDataTransfer({
          "application/x-lexical-editor": payload,
        }),
        $getRoot().select(0, 0),
      );
    },
    { discrete: true },
  );
  assertEquals(markdownOf(editor), "**hi**\n\nsub\n\n[**go**](http://x.com)\n");
});

Deno.test("json payload from a foreign namespace is not claimed", () => {
  const editor = createEditor();
  const payload = JSON.stringify({
    namespace: "some-other-editor",
    nodes: [{ type: "paragraph", children: [] }],
  });
  editor.update(
    () => {
      $insertDataTransferForRichText(
        fakeDataTransfer({
          "application/x-lexical-editor": payload,
        }),
        $getRoot().select(0, 0),
      );
    },
    { discrete: true },
  );
  assertEquals(markdownOf(editor), "");
});
