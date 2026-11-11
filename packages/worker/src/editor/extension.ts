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
import type { Categories } from "#/models/categories.ts";
import type {
  MarkBadge,
  MarkBlocks,
  MarkedBlocks,
  MarkNumbers,
  MarkRect,
  SidenotePositions,
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
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  markBadges: Signal<MarkBadge[]>;
  markRects: Signal<MarkRect[]>;
  markedBlocks: Signal<MarkedBlocks>;
  markBlocks: Signal<MarkBlocks>;
  categories: Categories;
  fonts: ReadonlyArray<Signal<string>>;
  writable: boolean;
}

export function createEditorExtension(
  path: string,
  {
    resolved,
    markdown,
    selection,
    sidenotePositions,
    markNumbers,
    markBadges,
    markRects,
    markedBlocks,
    markBlocks,
    categories,
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
        sidenotePositions,
        markNumbers,
        markBadges,
        markRects,
        markedBlocks,
        markBlocks,
        resolved,
        categories,
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
