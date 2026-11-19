import { computed, createModel } from "@preact/signals";

import type { CaretRect, EditorSelection } from "#/signals/editorSelection.ts";

export type ToolbarMode = "selection" | "empty";

export interface ToolbarDisplay {
  mode: ToolbarMode;
  rect: CaretRect;
}

export const ToolbarModel = createModel((selection: EditorSelection) => {
  const display = computed((): ToolbarDisplay | null => {
    const rect = selection.caretRect.value;
    if (rect === null) return null;
    const mode = selection.selectionActive.value
      ? "selection"
      : selection.emptyParagraph.value
        ? "empty"
        : null;
    return mode !== null ? { mode, rect } : null;
  });
  return { display };
});

export type Toolbar = InstanceType<typeof ToolbarModel>;
