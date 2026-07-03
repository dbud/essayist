import { CodeExtension } from "@lexical/code";
import {
  AutoFocusExtension,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { MarkExtension } from "@lexical/mark";
import { RichTextExtension } from "@lexical/rich-text";
import { configExtension, defineExtension } from "lexical";
import { MarksExtension } from "./markExtension.ts";
import { MarksAtCursorExtension } from "./marksAtCursorExtension.ts";
import { ToolbarStateExtension } from "./toolbarStateExtension.ts";

export function createEditorExtension(path: string) {
  return defineExtension({
    name: "[root]",
    namespace: "essayist-editor",
    dependencies: [
      RichTextExtension,
      HistoryExtension,
      configExtension(AutoFocusExtension, { defaultSelection: "rootStart" }),
      LinkExtension,
      ListExtension,
      CodeExtension,
      HorizontalRuleExtension,
      configExtension(MarksExtension, { path }),
      MarksAtCursorExtension,
      ToolbarStateExtension,
    ],
  });
}

export const bootstrapEditorExtension = defineExtension({
  name: "[bootstrap]",
  namespace: "bootstrap-markdown",
  dependencies: [
    RichTextExtension,
    LinkExtension,
    ListExtension,
    CodeExtension,
    HorizontalRuleExtension,
    MarkExtension,
  ],
});
