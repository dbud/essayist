import { defineExtension } from "@lexical/extension";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  type LexicalEditor,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { defaultEditorSelection } from "@/signals/editorSelection.ts";
import {
  adjacentElementRect,
  charRectAt,
  elementRectFallback,
  getMeasureContext,
  resolveTextPoint,
} from "./domMeasure.ts";
import { createRafScheduler, registerRootObserver } from "./editorDom.ts";
import type { SelectionExtensionConfig } from "./toolbarStateExtension.ts";

// Publishes the caret rect into `selection.caretRect` (editor-column coords,
// matching MarkBadges). Hides on blur or non-range selection; on a text
// selection it stays at the focus so the caret doesn't vanish.
//
// At a soft wrap, "end of the previous line" and "start of the next" share one
// offset and the collapsed range is always the end of the previous line. The
// native caret's side is a hidden browser state, and an arrow at that offset
// re-renders the SAME offset as the other side without firing selectionchange.
// So we track an `affinity` in state, driven by KEY_ARROW_*_COMMAND (the only
// event on that toggle): a same-offset arrow flips it; an offset-changing
// left/right move sets it by direction; a down/up move keeps it (vertical
// moves preserve the side you were on); a re-measure with no arrow keeps it.
export const CaretExtension = defineExtension({
  name: "caret",
  config: { selection: defaultEditorSelection },
  afterRegistration: (
    editor: LexicalEditor,
    { selection }: SelectionExtensionConfig,
  ) => {
    let lastOffset = -1;
    // "end" = end of the previous line; "start" = start of the next line.
    let affinity: "end" | "start" = "end";
    // The arrow that triggered the pending measure, consumed by the next
    // measure (set on KEY_ARROW_*_COMMAND, cleared after each measure).
    let pending: "right" | "left" | "down" | "up" | null = null;

    const measure = () => {
      const root = editor.getRootElement();
      if (root === null || root.ownerDocument.activeElement !== root) {
        selection.caretRect.value = null;
        return;
      }
      editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!sel || !$isRangeSelection(sel)) {
          selection.caretRect.value = null;
          return;
        }
        const ctx = getMeasureContext(root);
        if (ctx === null) return;
        const native = ctx.doc.getSelection();
        if (native === null || native.focusNode === null) return;
        // Collapse to the focus (the moving end of a selection). Resolve an
        // element caret -- e.g. on a mark after a line-break/backspace join --
        // to the adjacent text node so the collapsed range has a line-box.
        const focusNode = native.focusNode;
        const offset = native.focusOffset;
        const point = resolveTextPoint(focusNode, offset, ctx.doc);
        const text = point?.node ?? null;
        const textOffset = point?.offset ?? offset;
        const range = ctx.doc.createRange();
        range.setStart(text ?? focusNode, textOffset);
        range.collapse(true);
        const collapsed = range.getBoundingClientRect();
        const isText = text !== null && text.length > 0;
        const left = isText ? charRectAt(text, textOffset - 1, ctx.doc) : null;
        const right = isText ? charRectAt(text, textOffset, ctx.doc) : null;

        let rect: DOMRect | null;
        if (left !== null && right !== null && left.top !== right.top) {
          // Wrap boundary: the collapsed rect is the end of the previous line,
          // `right` is the start of the next. Pick the side from the last move.
          if (textOffset === lastOffset && pending !== null) {
            // A same-offset arrow at the boundary flips the side: right/down
            // toward the start of the next line, left/up toward the end of the
            // previous one.
            affinity =
              pending === "right" || pending === "down" ? "start" : "end";
          } else if (
            textOffset !== lastOffset &&
            pending !== "down" &&
            pending !== "up"
          ) {
            // Horizontal move sets the side by direction; a vertical move
            // keeps the side (you stay on the same edge of the line).
            affinity = textOffset > lastOffset ? "end" : "start";
          }
          rect = affinity === "start" ? right : collapsed;
        } else {
          rect = collapsed.height > 0 ? collapsed : null;
          // At the start of the text there is no preceding char on this line,
          // so mark the caret as on the start side -- otherwise the default
          // "end" affinity makes a following down-arrow render at the end of
          // the first line instead of the start of the second.
          if (left === null) affinity = "start";
        }
        if (rect === null || rect.height === 0) {
          rect =
            adjacentElementRect(focusNode, offset, ctx.doc) ??
            elementRectFallback(focusNode, ctx.doc);
        }
        pending = null;
        lastOffset = textOffset;
        if (rect === null) {
          selection.caretRect.value = null;
          return;
        }
        selection.caretRect.value = {
          left: rect.left - ctx.containerRect.left,
          top: rect.top - ctx.containerRect.top,
          height: rect.height,
        };
      });
    };

    const { schedule, dispose } = createRafScheduler(measure);

    const removeRootObserver = registerRootObserver(editor, (root) => {
      const ro = new ResizeObserver(schedule);
      ro.observe(root);
      const onFocus = () => schedule();
      root.addEventListener("focus", onFocus, { passive: true });
      root.addEventListener("blur", onFocus, { passive: true });
      // SELECTION_CHANGE_COMMAND does not fire on a wrap toggle, so also listen
      // to the native event.
      const onSelChange = () => {
        if (root.ownerDocument.activeElement === root) schedule();
      };
      root.ownerDocument.addEventListener("selectionchange", onSelChange);
      schedule();
      return () => {
        ro.disconnect();
        root.removeEventListener("focus", onFocus);
        root.removeEventListener("blur", onFocus);
        root.ownerDocument.removeEventListener("selectionchange", onSelChange);
      };
    });

    return mergeRegister(
      removeRootObserver,
      dispose,
      editor.registerUpdateListener(schedule),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          schedule();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      ...(
        [
          [KEY_ARROW_RIGHT_COMMAND, "right"],
          [KEY_ARROW_LEFT_COMMAND, "left"],
          [KEY_ARROW_DOWN_COMMAND, "down"],
          [KEY_ARROW_UP_COMMAND, "up"],
        ] as const
      ).map(([cmd, direction]) =>
        editor.registerCommand(
          cmd,
          () => {
            pending = direction;
            schedule();
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    );
  },
});
