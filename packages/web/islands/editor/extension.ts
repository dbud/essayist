import { CodeExtension } from "@lexical/code";
import {
  AutoFocusExtension,
  HorizontalRuleExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { RichTextExtension } from "@lexical/rich-text";
import { configExtension, defineExtension } from "lexical";
import { MarksExtension } from "./markExtension.ts";

const editorExtension = defineExtension({
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
    MarksExtension,
  ],
});

export default editorExtension;
