import { createModel, signal } from "@preact/signals";
import type { BlockType } from "@/editor/blockFormat.ts";

/**
 * Per-file editor-selection state, written by the editor extensions
 * (`ToolbarStateExtension` for block/format flags, `MarksAtCursorExtension`
 * for mark ids) and read by toolbar/sidebar components. Cached per
 * (workspace, path) so the same path in different workspaces keeps separate
 * toolbar state.
 */
export const EditorSelectionModel = createModel(
  (_workspaceId: string, _path: string) => {
    const block = signal<BlockType>("normal");
    const bold = signal(false);
    const italic = signal(false);
    const strikethrough = signal(false);
    const code = signal(false);
    const inCodeBlock = signal(false);
    const markIds = signal<Set<string>>(new Set());
    return { block, bold, italic, strikethrough, code, inCodeBlock, markIds };
  },
);

export type EditorSelection = InstanceType<typeof EditorSelectionModel>;

/** Sink used as the default config for extensions when no model is injected. */
export const defaultEditorSelection: EditorSelection = new EditorSelectionModel(
  "",
  "",
);

const cache = new Map<string, EditorSelection>();

export function getEditorSelection(
  workspaceId: string,
  path: string,
): EditorSelection {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new EditorSelectionModel(workspaceId, path),
  );
}
