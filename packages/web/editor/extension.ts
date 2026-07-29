import type { Mark } from "@essayist/core";
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
import { PartialUpdateExtension } from "@/editor/partialUpdateExtension.ts";
import type { EditorSelection } from "@/signals/editorSelection.ts";
import type {
  MarkBadge,
  MarkNumbers,
  MarkRect,
  SidenotePositions,
} from "@/signals/sidenotes.ts";
import { MarksExtension } from "./markExtension.ts";
import { MarksAtCursorExtension } from "./marksAtCursorExtension.ts";
import { SidenoteExtension } from "./sidenoteExtension.ts";
import { ToolbarStateExtension } from "./toolbarStateExtension.ts";

interface EditorDeps {
  resolved: Signal<Mark[]>;
  markdown: Signal<string>;
  selection: EditorSelection;
  sidenotePositions: Signal<SidenotePositions>;
  markNumbers: Signal<MarkNumbers>;
  markBadges: Signal<MarkBadge[]>;
  markRects: Signal<MarkRect[]>;
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
  }: EditorDeps,
) {
  return defineExtension({
    name: "[root]",
    namespace: "essayist-editor",
    theme: {
      text: {
        strikethrough: "line-through",
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
        resolved,
      }),
      configExtension(ToolbarStateExtension, { selection }),
      configExtension(MarksAtCursorExtension, { selection }),
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
