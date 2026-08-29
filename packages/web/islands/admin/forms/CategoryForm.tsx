import type { Category } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { TextareaRow } from "@/components/ui/forms/TextareaRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import { type CategoryInput, getAdminConfig } from "@/signals/admin.ts";

export function CategoryForm({
  entity,
  open,
}: {
  entity?: Category;
  open: Signal<boolean>;
}) {
  const admin = getAdminConfig();
  const [label, setLabel] = useState(entity?.label ?? "");
  const [severity, setSeverity] = useState(entity?.severity ?? "");
  const [color, setColor] = useState(entity?.color ?? "");
  const [description, setDescription] = useState(entity?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!label.trim()) return setError("Label is required.");
    const data: CategoryInput = {
      label: label.trim(),
      ...(severity.trim() ? { severity: severity.trim() } : {}),
      ...(color.trim() ? { color: color.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const ok = entity
      ? await admin.updateCategory(entity.id, data)
      : await admin.createCategory(data);
    if (ok) open.value = false;
  }

  return (
    <FormShell
      title={entity ? "Edit category" : "New category"}
      submitLabel={entity ? "Save" : "Create"}
      submitting={admin.mutating.value}
      onCancel={() => (open.value = false)}
      error={error}
      onSubmit={handleSubmit}
    >
      <TextRow label="label" value={label} onInput={setLabel} />
      <TextRow label="severity" value={severity} onInput={setSeverity} />
      <TextRow label="color" value={color} onInput={setColor} />
      <TextareaRow
        label="description"
        value={description}
        onInput={setDescription}
        rows={4}
      />
    </FormShell>
  );
}
