import type { Mark } from "@essayist/core";
import { CodeExtension } from "@lexical/code";
import { AutoFocusExtension, HorizontalRuleExtension } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { MarkExtension } from "@lexical/mark";
import { RichTextExtension } from "@lexical/rich-text";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { configExtension, defineExtension, type NodeKey } from "lexical";

import { PartialUpdateExtension } from "#/editor/partialUpdateExtension.ts";
import type { MeasuredMarks, Spacer } from "#/geometry/layout.ts";
import type { MarkFragmentBadge, MarkFragmentRect, MarkOrdinals } from "#/models/sidenotes.ts";
import type { EditorSelection } from "#/signals/editorSelection.ts";

import { ApplyBlockMarginExtension } from "./applyBlockMarginExtension.ts";
import { CaretExtension } from "./caretExtension.ts";
import { MarksExtension } from "./markExtension.ts";
import { MarksAtCursorExtension } from "./marksAtCursorExtension.ts";
import { PastePolicyExtension } from "./paste/pastePolicyExtension.ts";
import { SidenoteExtension } from "./sidenoteExtension.ts";
import { ToolbarStateExtension } from "./toolbarStateExtension.ts";

interface EditorDeps {
  resolved: ReadonlySignal<readonly Mark[]>;
  markdown: Signal<string>;
  selection: EditorSelection;
  measuredMarks: Signal<MeasuredMarks>;
  margins: ReadonlySignal<ReadonlyMap<NodeKey, Spacer>>;
  markOrdinals: ReadonlySignal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  fonts: ReadonlyArray<Signal<string>>;
  writable: boolean;
}

export function createEditorExtension(
  path: string,
  {
    resolved,
    markdown,
    selection,
    measuredMarks,
    margins,
    markOrdinals,
    markFragmentBadges,
    markFragmentRects,
    fonts,
    writable,
  }: EditorDeps,
) {
  return defineExtension({
    name: "[root]",
    namespace: "essayist-editor",
    editable: writable,
    theme: {
      text: {
        italic: "italic",
        strikethrough: "line-through",
        underline: "underline",
      },
    },
    dependencies: [
      RichTextExtension,
      HistoryExtension,
      configExtension(AutoFocusExtension, { defaultSelection: "rootStart" }),
      LinkExtension,
      ListExtension,
      CodeExtension,
      HorizontalRuleExtension,
      PastePolicyExtension,
      configExtension(MarksExtension, {
        path,
        resolved,
        markdown,
      }),
      configExtension(SidenoteExtension, {
        measuredMarks,
        markOrdinals,
        markFragmentBadges,
        markFragmentRects,
        resolved,
        fonts,
      }),
      configExtension(ApplyBlockMarginExtension, { margins }),
      configExtension(ToolbarStateExtension, { selection }),
      configExtension(MarksAtCursorExtension, { selection }),
      configExtension(CaretExtension, { selection }),
      PartialUpdateExtension,
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
