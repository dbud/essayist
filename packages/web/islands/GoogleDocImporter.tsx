import { useSignal } from "@preact/signals";
import { Download } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getFileTree } from "@/signals/fileTree.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { showToast } from "@/signals/toast.ts";
import { workspaces } from "@/signals/workspace.ts";
import type { PickerDoc } from "@/utils/googlePicker.ts";

interface PickedMessage {
  type: "picked";
  docs: PickerDoc[];
}

export default function GoogleDocImporter() {
  const importing = useSignal(false);
  const wsIdRef = useRef<string | null>(null);

  async function runImport(docs: PickerDoc[]) {
    const wsId = wsIdRef.current;
    wsIdRef.current = null;
    if (!wsId) {
      showToast("No workspace selected", "error");
      return;
    }
    importing.value = true;
    const toast = showToast(
      `Importing ${docs.length} doc${docs.length === 1 ? "" : "s"}…`,
    );
    const errors: string[] = [];
    let firstPath: string | null = null;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      toast.value = {
        ...toast.value,
        message: `Importing ${i + 1}/${docs.length}: ${doc.name}…`,
        type: "info",
        progress: { done: i, total: docs.length },
      };
      const res = await fetch(`/api/workspaces/${wsId}/import/google-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: doc.id, name: doc.name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        errors.push(`${doc.name}: ${body?.error ?? `failed (${res.status})`}`);
      } else {
        const body = (await res.json()) as { path: string };
        if (firstPath === null) firstPath = body.path;
      }
    }

    await getFileTree()?.load();
    if (firstPath) getOpenedFiles()?.open(firstPath);

    toast.value = {
      ...toast.value,
      message:
        errors.length > 0
          ? `Imported ${docs.length - errors.length}/${docs.length}${
              errors.length > 0 ? ` (${errors.length} failed)` : ""
            }`
          : `Imported ${docs.length} doc${docs.length === 1 ? "" : "s"}`,
      type: errors.length > 0 ? "error" : "success",
    };
    importing.value = false;
  }

  // The Picker runs in a separate tab; it postMessages the picked docs back.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== globalThis.location.origin) return;
      const data = e.data as PickedMessage | undefined;
      if (data?.type !== "picked" || !Array.isArray(data.docs)) return;
      runImport(data.docs);
    }
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, []);

  function handleImport() {
    if (importing.value) return;
    wsIdRef.current = workspaces.currentWorkspaceId.value;
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
      {!importing.value && (
        <span class="badge flex gap-1 self-start ms-auto">
          opens in a new tab
        </span>
      )}
      <WaveBars fill amplitude={importing.value ? 1 : 0} />
    </button>
  );
}
