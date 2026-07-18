import { type Signal, useSignal } from "@preact/signals";
import Dialog from "@/components/Dialog.tsx";
import { getFileTree } from "@/signals/fileTree.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";

interface CreateFileDialogProps {
  open: Signal<boolean>;
}

/**
 * Dialog for creating a new file in the current workspace. The user supplies
 * the full path (e.g. "notes/ideas.md"); the file is created empty and then
 * opened in the editor.
 */
export default function CreateFileDialog({ open }: CreateFileDialogProps) {
  const path = useSignal("");
  const error = useSignal<string | null>(null);
  const submitting = useSignal(false);

  async function onSubmit(e: Event) {
    e.preventDefault();
    const trimmed = path.value.trim();
    if (!trimmed || submitting.value) return;
    submitting.value = true;
    error.value = null;
    try {
      const files = getFileTree();
      if (!files) throw new Error("No workspace selected");
      await files.createFile(trimmed);
      getOpenedFiles()?.open(trimmed);
      path.value = "";
      open.value = false;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to create file";
    } finally {
      submitting.value = false;
    }
  }

  return (
    <Dialog open={open} title="New file">
      <form onSubmit={onSubmit} class="mt-4 flex flex-col gap-3">
        <label class="input">
          <span class="label">Path</span>
          <input
            type="text"
            placeholder="e.g. notes/ideas.md"
            value={path.value}
            onInput={(e) => (path.value = e.currentTarget.value)}
            disabled={submitting.value}
            autofocus
          />
        </label>
        {error.value && (
          <div role="alert" class="alert alert-error text-sm py-2">
            {error.value}
          </div>
        )}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => {
              open.value = false;
              error.value = null;
            }}
            disabled={submitting.value}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={submitting.value || !path.value.trim()}
          >
            {submitting.value && (
              <span class="loading loading-spinner loading-sm" />
            )}
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}
