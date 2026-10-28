import { computed, type ReadonlySignal } from "@preact/signals";

import type { FileSelection } from "./fileSelection.ts";
import type { FileVersionsByPath } from "./fileVersionsByPath.ts";

export function createFileWritability(
  selected: ReadonlySignal<FileSelection | null>,
  fileVersions: FileVersionsByPath,
): ReadonlySignal<boolean> {
  return computed(() => {
    const selection = selected.value;
    // The versions list is append-ordered, so the newest is last.
    return (
      selection !== null &&
      fileVersions.current.value?.versions.value.at(-1)?.version_id === selection.versionId
    );
  });
}
