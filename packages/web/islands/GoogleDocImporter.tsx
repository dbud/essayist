import { useSignal } from "@preact/signals";
import { Download } from "lucide-preact";
import { getFileTree } from "@/signals/fileTree.ts";
import { dismissToast, showToast } from "@/signals/toast.ts";
import { workspaces } from "@/signals/workspace.ts";
import { openGooglePicker, type PickerDoc } from "@/utils/googlePicker.ts";

export default function GoogleDocImporter() {
  const importing = useSignal(false);

  async function handleImport() {
    const wsId = workspaces.currentWorkspaceId.value;
    if (!wsId || importing.value) return;

    const configRes = await fetch("/api/integrations/google-picker-config");
    if (!configRes.ok) {
      const body = (await configRes.json().catch(() => null)) as {
        error?: string;
      } | null;
      showToast(
        body?.error ?? `Picker config failed (${configRes.status})`,
        "error",
      );
      return;
    }
    const config = (await configRes.json()) as {
      accessToken: string;
      developerKey: string;
      appId?: string;
    };

    let docs: PickerDoc[];
    try {
      docs = await openGooglePicker(config);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to open Google Picker",
        "error",
      );
      return;
    }
    if (docs.length === 0) return;

    importing.value = true;
    const toast = showToast(
      `Importing ${docs.length} doc${docs.length === 1 ? "" : "s"}…`,
    );
    const errors: string[] = [];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      toast.value = {
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
      }
    }

    await getFileTree()?.load();

    toast.value = {
      message:
        errors.length > 0
          ? `Imported ${docs.length - errors.length}/${docs.length}${
              errors.length > 0 ? ` (${errors.length} failed)` : ""
            }`
          : `Imported ${docs.length} doc${docs.length === 1 ? "" : "s"}`,
      type: errors.length > 0 ? "error" : "success",
    };
    setTimeout(() => dismissToast(toast), 5000);
    importing.value = false;
  }

  return (
    <button
      type="button"
      class="btn btn-sm gap-2"
      onClick={handleImport}
      disabled={importing.value}
      title="Import from Google Docs"
    >
      {importing.value ? (
        <span class="loading loading-spinner loading-xs" />
      ) : (
        <Download size={16} />
      )}
      Import
    </button>
  );
}
