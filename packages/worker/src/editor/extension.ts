import type { Mark } from "@essayist/core";
import { CodeExtension } from "@lexical/code";
import { AutoFocusExtension, HorizontalRuleExtension } from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { MarkExtension } from "@lexical/mark";
import { RichTextExtension } from "@lexical/rich-text";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { configExtension, defineExtension } from "lexical";

import { PartialUpdateExtension } from "#/editor/partialUpdateExtension.ts";
import type { MarkedBlock } from "#/geometry/layout.ts";
import type {
  MarkAnchorTop,
  MarkFragmentBadge,
  MarkFragmentRect,
  MarkFragmentTop,
  MarkOrdinals,
} from "#/models/sidenotes.ts";
import type { EditorSelection } from "#/signals/editorSelection.ts";

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
  markFragmentTops: Signal<ReadonlyArray<MarkFragmentTop>>;
  markAnchorTops: Signal<ReadonlyArray<MarkAnchorTop>>;
  markOrdinals: ReadonlySignal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  markedBlocks: Signal<MarkedBlock[]>;
  fonts: ReadonlyArray<Signal<string>>;
  writable: boolean;
}

export function createEditorExtension(
  path: string,
  {
    resolved,
    markdown,
    selection,
    markFragmentTops,
    markAnchorTops,
    markOrdinals,
    markFragmentBadges,
    markFragmentRects,
    markedBlocks,
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
        markFragmentTops,
        markAnchorTops,
        markOrdinals,
        markFragmentBadges,
        markFragmentRects,
        markedBlocks,
        resolved,
        fonts,
      }),
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
