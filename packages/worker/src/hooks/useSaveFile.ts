import { useRef } from "preact/hooks";

import type { FileContent } from "#/models/fileContent.ts";
import { useEditorModels } from "#/pages/editor/models.ts";

/**
 * A save callback bound to the open file: saves, and when the save materialized a pending buffer,
 * brings the tree row up to server truth and selects the file.
 */
export function useSaveFile(
  file: FileContent | null,
): (options?: { readonly keepalive?: boolean }) => Promise<void> {
  const { fileTrees, selected } = useEditorModels();
  // The tree and path at mount belong to the file's workspace; a file switch remounts the view.
  const tree = useRef(fileTrees.current.value ?? null);
  const path = useRef(selected.value?.path ?? null);
  return async (options?: { readonly keepalive?: boolean }) => {
    const outcome = await file?.save(options);
    if (outcome === "created" && tree.current && path.current) {
      await tree.current.load();
      tree.current.select(path.current);
    }
  };
}
