import { computed } from "@preact/signals";
import {
  editorBaselineSerializedSnapshots,
  editorSnapshots,
} from "@/signals.ts";

export function useFileDirty(path: string) {
  return computed(() => {
    const current = editorSnapshots.value.get(path);
    const baseline = editorBaselineSerializedSnapshots.value[path];
    if (!current || !baseline) return false;
    return JSON.stringify(current) !== baseline;
  });
}
