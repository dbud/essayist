import type { Signal } from "@preact/signals";

interface RemoveFileDialogProps {
  path: Signal<string | null>;
  onRemoved?: () => void;
}

export default function RemoveFileDialog({ path, onRemoved }: RemoveFileDialogProps) {
  const open = path.value !== null;

  function onSubmit(e: Event) {
    e.preventDefault();
    // TODO -- remove the file once soft delete lands
    path.value = null;
    onRemoved?.();
  }

  return (
    <form
      class={`dropdown dropdown--detached ${open ? "is-open" : ""}`}
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          path.value = null;
        }
      }}
    >
      <div class="menu">
        <div class="form" data-stagger>
          <div class="col-span-2">Remove &ldquo;{path.value}&rdquo;?</div>
        </div>
      </div>
      <div class="flex justify-end gap-4">
        <button type="button" class="btn" onClick={() => (path.value = null)}>
          Cancel
        </button>
        <button type="submit" class="btn--accent">
          Remove
        </button>
      </div>
    </form>
  );
}
