import { createModel, signal } from "@preact/signals";
import type { BlockType } from "@/editor/blockFormat.ts";
import type { FileKey } from "@/signals/file.ts";

export interface CaretRect {
  left: number;
  top: number;
  height: number;
}

/**
 * Per-file editor-selection state, written by the editor extensions
 * (`ToolbarStateExtension` for block/format flags, `MarksAtCursorExtension`
 * for mark ids) and read by toolbar/sidebar components. Cached per
 * (workspace, path, version) so the same path in different workspaces and
 * views keeps separate toolbar state.
 */
export const EditorSelectionModel = createModel((_key: FileKey) => {
  const block = signal<BlockType>("normal");
  const bold = signal(false);
  const italic = signal(false);
  const strikethrough = signal(false);
  const code = signal(false);
  const inCodeBlock = signal(false);
  const markIds = signal<Set<string>>(new Set());
  const innerMarkId = signal<string | null>(null);
  const caretRect = signal<CaretRect | null>(null);
  return {
    block,
    bold,
    italic,
    strikethrough,
    code,
    inCodeBlock,
    markIds,
    innerMarkId,
    caretRect,
  };
});

export type EditorSelection = InstanceType<typeof EditorSelectionModel>;

/** Sink used as the default config for extensions when no model is injected. */
export const defaultEditorSelection: EditorSelection = new EditorSelectionModel(
  { wsId: "", path: "" },
);

const cache = new Map<string, EditorSelection>();

export function getEditorSelection(
  wsId: string,
  path: string,
  versionId?: string,
): EditorSelection {
  const key = `${wsId}:${path}:${versionId ?? ""}`;
  return cache.getOrInsertComputed(
    key,
    () => new EditorSelectionModel({ wsId, path, versionId }),
  );
}
