import { type Signal, useSignal } from "@preact/signals";
import Dialog from "@/components/ui/Dialog.tsx";
import { workspaces } from "@/signals/workspace.ts";

interface CreateWorkspaceDialogProps {
  open: Signal<boolean>;
}

export default function CreateWorkspaceDialog({
  open,
}: CreateWorkspaceDialogProps) {
  const name = useSignal("");
  const error = useSignal<string | null>(null);
  const submitting = useSignal(false);

  async function onSubmit(e: Event) {
    e.preventDefault();
    const trimmed = name.value.trim();
    if (!trimmed || submitting.value) return;
    submitting.value = true;
    error.value = null;
    try {
      await workspaces.create(trimmed);
      name.value = "";
      open.value = false;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Failed to create project";
    } finally {
      submitting.value = false;
    }
  }

  return (
    <Dialog open={open} title="New project">
      <form onSubmit={onSubmit} class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Name</span>
          <input
            type="text"
            placeholder="Project name"
            value={name.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
            disabled={submitting.value}
            autofocus
            class="input-text"
          />
        </label>
        {error.value && (
          <div role="alert" class="text-sm text-red-500">
            {error.value}
          </div>
        )}
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="btn"
            onClick={() => (open.value = false)}
            disabled={submitting.value}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn--accent"
            disabled={submitting.value || !name.value.trim()}
          >
            {submitting.value && <span class="loading" />}
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}
