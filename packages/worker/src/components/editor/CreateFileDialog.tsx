import { type Signal, useSignal } from "@preact/signals";
import { useLayoutEffect } from "preact/hooks";

import { useEditorModels } from "#/pages/editor/models.ts";

interface CreateFileDialogProps {
  open: Signal<boolean>;
  onCreated?: () => void;
}

/** Create-form panel in the navigation melt slot: the menus yield its place while open. */
export default function CreateFileDialog({ open, onCreated }: CreateFileDialogProps) {
  const { fileTrees } = useEditorModels();
  const name = useSignal("");

  useLayoutEffect(() => {
    if (open.value) document.getElementById("create-file-name")?.focus({ preventScroll: true });
  }, [open.value]);

  function onSubmit(e: Event) {
    e.preventDefault();
    const trimmed = name.value.trim();
    if (!trimmed) return;
    fileTrees.current.value?.startPending(trimmed);
    name.value = "";
    open.value = false;
    onCreated?.();
  }

  return (
    <form
      class={`aq-dropdown aq-dropdown--detached ${open.value ? "is-open" : ""}`}
      autocomplete="off"
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open.value) {
          e.stopPropagation();
          open.value = false;
        }
      }}
    >
      <div class="aq-menu">
        <div class="aq-form" data-aq-stagger>
          <div class="col-span-2">New file</div>
          <label for="create-file-name">Name</label>
          <input
            id="create-file-name"
            type="text"
            placeholder="e.g. Essay draft"
            autocomplete="off"
            value={name.value}
            onInput={(e) => (name.value = e.currentTarget.value)}
          />
        </div>
      </div>
      <div class="flex justify-end gap-4">
        <button type="button" class="aq-btn" onClick={() => (open.value = false)}>
          Cancel
        </button>
        <button type="submit" class="aq-btn--accent" disabled={!name.value.trim()}>
          Create
        </button>
      </div>
    </form>
  );
}
