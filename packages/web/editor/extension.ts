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
import type { Signal } from "@preact/signals";
import { configExtension, defineExtension } from "lexical";
import type { EditorSelection } from "@/signals/editorSelection.ts";
import type { RangedMark } from "@/signals/marks.ts";
import { MarksExtension } from "./markExtension.ts";
import { MarksAtCursorExtension } from "./marksAtCursorExtension.ts";
import type { TextNodeSpan } from "./textNodeSpans.ts";
import { ToolbarStateExtension } from "./toolbarStateExtension.ts";

interface EditorDeps {
  ranges: Signal<RangedMark[]>;
  textNodeSpans: Signal<TextNodeSpan[]>;
  markdown: Signal<string>;
  selection: EditorSelection;
}

export function createEditorExtension(
  path: string,
  { ranges, textNodeSpans, markdown, selection }: EditorDeps,
) {
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
      configExtension(MarksExtension, {
        path,
        ranges,
        textNodeSpans,
        markdown,
      }),
      configExtension(ToolbarStateExtension, { selection }),
      configExtension(MarksAtCursorExtension, { selection }),
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
