import { type Signal, useSignal } from "@preact/signals";

import Dialog from "#/components/ui/Dialog.tsx";
import { useEditorModels } from "#/pages/editor/models.ts";

interface CreateFileDialogProps {
  open: Signal<boolean>;
  onCreated?: () => void;
}

/** Dialog for starting a new file in the current workspace. */
export default function CreateFileDialog({ open, onCreated }: CreateFileDialogProps) {
  const { fileTrees } = useEditorModels();
  const name = useSignal("");
  const pendingName = useSignal<string | null>(null);

  function onSubmit(e: Event) {
    e.preventDefault();
    const trimmed = name.value.trim();
    if (!trimmed) return;
    pendingName.value = trimmed;
    name.value = "";
    open.value = false;
    onCreated?.();
  }

  function onClosed() {
    const staged = pendingName.value;
    pendingName.value = null;
    if (staged !== null) fileTrees.current.value?.startPending(staged);
  }

  return (
    <Dialog open={open} onClosed={onClosed}>
      <form onSubmit={onSubmit} class="flex flex-col">
        <div class="cell cell--ink">New file</div>
        <div class="form-grid stack--row">
          <label class="cell" htmlFor="file-name">
            Name
          </label>
          <input
            id="file-name"
            type="text"
            placeholder="e.g. Essay draft"
            value={name.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
            autofocus
            class="input-text"
          />
          <div class="col-span-2 separator" />
          <div class="form-actions">
            <button type="button" class="btn" onClick={() => (open.value = false)}>
              Cancel
            </button>
            <button type="submit" class="btn cell--accent w-30" disabled={!name.value.trim()}>
              Create
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
