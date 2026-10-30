import { computed, type ReadonlySignal } from "@preact/signals";

import type { FileTrees } from "./fileTrees.ts";
import type { Workspaces } from "./workspaces.ts";

/**
 * A file open at a concrete version: the key for every per-view model, signal cache and component
 * props. Per-view caches use the string form.
 */
export interface FileKey {
  wsId: string;
  path: string;
  versionId: string;
}

export namespace FileKey {
  export function cacheKey(key: FileKey): string {
    return `${key.wsId}:${key.path}:${key.versionId}`;
  }
}

export type FileSelection = { wsId: string; path: null; versionId: null } | FileKey;

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
