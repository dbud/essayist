import { type Signal, useSignal } from "@preact/signals";
import Dialog from "@/components/ui/Dialog.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getFileTree } from "@/signals/fileTree.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";

interface CreateFileDialogProps {
  open: Signal<boolean>;
  onCreated?: () => void;
}

/** Dialog for creating a new file in the current workspace. */
export default function CreateFileDialog({
  open,
  onCreated,
}: CreateFileDialogProps) {
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
      onCreated?.();
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to create file";
    } finally {
      submitting.value = false;
    }
  }

  return (
    <Dialog open={open}>
      <form onSubmit={onSubmit} class="flex flex-col">
        <div class="cell cell--ink">New file</div>
        <div class="form-grid">
          <label class="cell" htmlFor="file-path">
            Path
          </label>
          <input
            id="file-path"
            type="text"
            placeholder="e.g. notes/ideas.md"
            value={path.value}
            onInput={(e) => (path.value = e.currentTarget.value)}
            disabled={submitting.value}
            autofocus
            class="input-text"
          />
          {error.value && (
            <div role="alert" class="cell col-span-2 text-red-500">
              {error.value}
            </div>
          )}
          <div class="col-span-2 separator" />
          <div class="form-actions">
            <button
              type="button"
              class="btn"
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
              class="btn cell--accent relative w-30"
              disabled={submitting.value || !path.value.trim()}
            >
              Create
              <WaveBars fill amplitude={submitting.value ? 1 : 0} />
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
