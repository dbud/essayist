import { computed, createModel } from "@preact/signals";

import type { CaretRect, EditorSelection } from "#/signals/editorSelection.ts";

export interface ToolbarDisplay {
  state: string;
  rect: CaretRect | null;
}

export const ToolbarModel = createModel((selection: EditorSelection) => {
  const display = computed((): ToolbarDisplay => ({
    state: "caret",
    rect: selection.caretRect.value,
  }));
  return { display };
});

export type Toolbar = InstanceType<typeof ToolbarModel>;
