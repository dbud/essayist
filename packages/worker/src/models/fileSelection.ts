import { computed, type ReadonlySignal } from "@preact/signals";
import type { FileTrees } from "./fileTrees.ts";
import type { Workspaces } from "./workspaces.ts";

export type FileSelection =
  | { wsId: string; path: null; versionId: null }
  | { wsId: string; path: string; versionId: string };

export function createFileSelection(
  workspaces: Workspaces,
  fileTrees: FileTrees,
): ReadonlySignal<FileSelection | null> {
  return computed(() => {
    const wsId = workspaces.selectedId.value;
    const fileTree = fileTrees.current.value;
    if (wsId === null || fileTree === null) return null;
    const path = fileTree.selectedPath.value;
    const versionId = fileTree.selectedVersionId.value;
    if (path === null || versionId === null) {
      return { wsId, path: null, versionId: null };
    }
    return { wsId, path, versionId };
  });
}
