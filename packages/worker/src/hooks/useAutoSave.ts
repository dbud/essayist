import { useEffect } from "preact/hooks";

import type { FileContent } from "#/models/fileContent.ts";
import { autoSave, autoSaveInterval } from "#/signals/preferences.ts";
import { debouncedEffect } from "#/utils/debouncedEffect.ts";

/**
 * Saves the file's pending content once the edits settle, and on the way out: when the page is
 * hidden, and when the view is torn down (a file switch).
 */
export function useAutoSave(file: FileContent | null): void {
  useEffect(() => {
    if (!file) return;
    const dispose = debouncedEffect(
      file.markdown,
      () => {
        if (autoSave.value) void file.save();
      },
      {
        delay: () => autoSaveInterval.value * 1000,
        onHide: () => void file.save({ keepalive: true }),
      },
    );
    return () => {
      dispose();
      void file.save();
    };
  }, [file]);
}
