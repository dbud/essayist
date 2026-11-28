import { computed, type ReadonlySignal } from "@preact/signals";

import type { FileTrees } from "./fileTrees.ts";
import type { Workspaces } from "./workspaces.ts";

/** A file of a workspace: the key of the per-file models, such as its versions and runs. */
export interface FileKey {
  wsId: string;
  fileId: string;
}

export namespace FileKey {
  export function cacheKey({ wsId, fileId }: FileKey): string {
    return `${wsId}:${fileId}`;
  }
}

/** A file open at a concrete version: the key of the per-view models, such as its content. */
export interface VersionKey extends FileKey {
  versionId: string;
}

export namespace VersionKey {
  export function cacheKey({ wsId, fileId, versionId }: VersionKey): string {
    return `${wsId}:${fileId}:${versionId}`;
  }
}

export type FileSelection = { wsId: string; fileId: null; versionId: null } | VersionKey;

export function createFileSelection(
  workspaces: Workspaces,
  fileTrees: FileTrees,
): ReadonlySignal<FileSelection | null> {
  return computed(() => {
    const wsId = workspaces.selectedId.value;
    const fileTree = fileTrees.current.value;
    if (wsId === null || fileTree === null) return null;
    const fileId = fileTree.selectedFileId.value;
    const versionId = fileTree.selectedVersionId.value;
    if (fileId === null || versionId === null) {
      return { wsId, fileId: null, versionId: null };
    }
    return { wsId, fileId, versionId };
  });
}
