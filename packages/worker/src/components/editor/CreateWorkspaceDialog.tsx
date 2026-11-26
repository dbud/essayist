import { type Signal, useSignal } from "@preact/signals";
import { useLayoutEffect } from "preact/hooks";

import WaveBars from "#/components/ui/WaveBars.tsx";
import { useEditorModels } from "#/pages/editor/models.ts";

interface CreateWorkspaceDialogProps {
  open: Signal<boolean>;
  onCreated?: () => void;
}

/** Create-form panel in the navigation melt slot: the menus yield its place while open. */
export default function CreateWorkspaceDialog({ open, onCreated }: CreateWorkspaceDialogProps) {
  const { workspaces } = useEditorModels();
  const name = useSignal("");
  const error = useSignal<string | null>(null);
  const submitting = useSignal(false);

  useLayoutEffect(() => {
    if (open.value) document.getElementById("create-project-name")?.focus({ preventScroll: true });
  }, [open.value]);

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
      onCreated?.();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to create project";
    } finally {
      submitting.value = false;
    }
  }

  return (
    <form
      class={`dropdown dropdown--detached ${open.value ? "is-open" : ""}`}
      autocomplete="off"
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
          <div class="col-span-2">New project</div>
          <label for="create-project-name">Name</label>
          <input
            id="create-project-name"
            type="text"
            placeholder="Project name"
            value={name.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
          />
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
          class="btn btn--solid"
          onClick={() => (open.value = false)}
          disabled={submitting.value}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn btn--accent relative"
          disabled={submitting.value || !name.value.trim()}
        >
          {submitting.value ? "Creating…" : "Create"}
          <WaveBars fill amplitude={submitting.value ? 1 : 0} />
        </button>
      </div>
    </form>
  );
}
