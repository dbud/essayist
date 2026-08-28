import { type Signal, useSignal } from "@preact/signals";
import Dialog from "@/components/ui/Dialog.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
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
    <Dialog open={open}>
      <form onSubmit={onSubmit} class="grid grid-cols-2 stack stack--col">
        <div class="cell cell--ink col-span-2">New project</div>
        <label class="cell" htmlFor="workspace-name">
          Name
        </label>
        <input
          id="workspace-name"
          type="text"
          placeholder="Project name"
          value={name.value}
          onInput={(e) => (name.value = e.currentTarget.value)}
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
        <div class="col-span-2 flex stack stack--row justify-end">
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
            class="btn cell--accent relative w-30"
            disabled={submitting.value || !name.value.trim()}
          >
            {submitting.value ? "Creating…" : "Create"}
            <WaveBars fill amplitude={submitting.value ? 1 : 0} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
