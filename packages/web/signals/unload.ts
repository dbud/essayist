import { IS_BROWSER } from "fresh/runtime";
import { anyFileDirty, flushAllDirty } from "@/signals/file.ts";
import { autoSave } from "@/signals/preferences.ts";

// Loss prevention at page unload. Autosave on: flush dirty files with a
// keepalive PUT (best effort). Autosave off: never write silently; the
// browser's native dialog guards unsaved changes instead.
if (IS_BROWSER) {
  globalThis.addEventListener("pagehide", () => {
    if (autoSave.value) flushAllDirty();
  });

  globalThis.addEventListener("beforeunload", (e) => {
    if (!autoSave.value && anyFileDirty()) e.preventDefault();
  });
}
