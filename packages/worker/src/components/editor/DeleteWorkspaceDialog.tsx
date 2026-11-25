import { type Signal, useSignal } from "@preact/signals";

import WaveBars from "#/components/ui/WaveBars.tsx";
import { useEditorModels } from "#/pages/editor/models.ts";

interface DeleteWorkspaceDialogProps {
  open: Signal<boolean>;
  onDeleted?: () => void;
}

export default function DeleteWorkspaceDialog({ open, onDeleted }: DeleteWorkspaceDialogProps) {
  const { workspaces } = useEditorModels();
  const error = useSignal<string | null>(null);
  const submitting = useSignal(false);
  const workspace = workspaces.current.value;

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (workspace === undefined || submitting.value) return;
    submitting.value = true;
    error.value = null;
    try {
      await workspaces.remove(workspace.id);
      open.value = false;
      onDeleted?.();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete project";
    } finally {
      submitting.value = false;
    }
  }

  return (
    <form
      class={`dropdown dropdown--detached ${open.value ? "is-open" : ""}`}
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open.value) {
          e.stopPropagation();
          open.value = false;
        }
      }}
    >
      <div class="menu">
        <div class="form" data-stagger>
          <div class="col-span-2">Delete project &ldquo;{workspace?.name}&rdquo;?</div>
          {error.value && (
            <div class="col-span-2 text-[0.8rem] text-red-400" role="alert">
              {error.value}
            </div>
          )}
        </div>
      </div>
      <div class="flex justify-end gap-4">
        <button
          type="button"
          class="btn--solid"
          onClick={() => (open.value = false)}
          disabled={submitting.value}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn--accent relative"
          disabled={submitting.value || workspace === undefined}
        >
          {submitting.value ? "Deleting..." : "Delete"}
          <WaveBars fill amplitude={submitting.value ? 1 : 0} />
        </button>
      </div>
    </form>
  );
}
