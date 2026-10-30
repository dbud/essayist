import { useSignal } from "@preact/signals";
import { Download } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import type { PickerDoc } from "#/client/googlePicker.ts";
import WaveBars from "#/components/ui/WaveBars.tsx";
import type { FileTree } from "#/models/fileTree.ts";
import { batchFailureMessage, formatBatchResult } from "#/models/utils/batch.ts";
import { showToast, showTaskToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { navigationOpened } from "#/signals/navigation.ts";
import { formatCount } from "#/utils/format.ts";

interface PickedMessage {
  type: "picked";
  docs: PickerDoc[];
}

export default function GoogleDocImporter() {
  const importing = useSignal(false);
  const treeRef = useRef<FileTree | null>(null);
  const { fileTrees } = useEditorModels();

  async function runImport(docs: PickerDoc[]) {
    if (importing.value) {
      showToast("An import is already running");
      return;
    }
    const tree = treeRef.current;
    if (tree === null) {
      showToast("No workspace selected", "error");
      return;
    }
    importing.value = true;
    const task = showTaskToast(`Importing ${formatCount(docs.length, "document")}…`);
    try {
      const result = await tree.importDocs(docs, (index, name) =>
        task.step(`Importing ${index + 1}/${docs.length}: ${name}…`, {
          done: index,
          total: docs.length,
        }),
      );
      task.settle(formatBatchResult("Imported", result, "document"), result.failed.length === 0);
      if (docs.length === 1 && result.ok === 1) {
        navigationOpened.value = false;
      }
    } catch (err) {
      task.settle(batchFailureMessage(err, "Imported", "document"), false);
    } finally {
      importing.value = false;
    }
  }

  // The Picker runs in a separate tab; it postMessages the picked docs back.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== globalThis.location.origin) return;
      const data = e.data as PickedMessage | undefined;
      if (data?.type !== "picked" || !Array.isArray(data.docs)) return;
      void runImport(data.docs);
    }
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, []);

  function handleImport() {
    if (importing.value) return;
    treeRef.current = fileTrees.current.value ?? null;
    globalThis.open("/import/google-docs", "_blank");
  }

  return (
    <button
      type="button"
      class="btn"
      onClick={handleImport}
      disabled={importing.value}
      title="Import from Google Docs"
      data-tooltip="Import documents from my Google Drive"
    >
      <Download size={14} />
      Import from Google Docs&hellip;
      {!importing.value && <span class="note">opens in a new tab</span>}
      <WaveBars fill amplitude={importing.value ? 1 : 0} />
    </button>
  );
}
