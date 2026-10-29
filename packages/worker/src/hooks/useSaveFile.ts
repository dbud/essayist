import { useRef } from "preact/hooks";

import type { FileContent } from "#/models/fileContent.ts";
import { useEditorModels } from "#/pages/editor/models.ts";

/** A save callback bound to the open file. */
export function useSaveFile(
  file: FileContent | null,
): (options?: { readonly keepalive?: boolean }) => Promise<void> {
  const { fileTrees, selected } = useEditorModels();
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
