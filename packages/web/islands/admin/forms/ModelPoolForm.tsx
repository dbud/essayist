import type { ModelPool } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { TextareaRow } from "@/components/ui/forms/TextareaRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import { lines } from "@/islands/admin/forms/lines.ts";
import { getAdminConfig, type ModelPoolInput } from "@/signals/admin.ts";

export function ModelPoolForm({
  entity,
  open,
}: {
  entity?: ModelPool;
  open: Signal<boolean>;
}) {
  const admin = getAdminConfig();
  const [name, setName] = useState(entity?.name ?? "");
  const [modelsText, setModelsText] = useState(
    (entity?.models ?? []).join("\n"),
  );
  const [env, setEnv] = useState(entity?.apiKeyEnvKey ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const models = lines(modelsText);
    if (!name.trim()) return setError("Name is required.");
    if (models.length === 0) {
      return setError("At least one model is required.");
    }
    const data: ModelPoolInput = {
      name: name.trim(),
      models,
      ...(env.trim() ? { apiKeyEnvKey: env.trim() } : {}),
    };
    const ok = entity
      ? await admin.updateModelPool(entity.id, data)
      : await admin.createModelPool(data);
    if (ok) open.value = false;
  }

  return (
    <FormShell
      title={entity ? "Edit model pool" : "New model pool"}
      submitLabel={entity ? "Save" : "Create"}
      submitting={admin.mutating.value}
      onCancel={() => (open.value = false)}
      error={error}
      onSubmit={handleSubmit}
    >
      <TextRow label="name" value={name} onInput={setName} />
      <TextareaRow
        label="models (one per line)"
        value={modelsText}
        onInput={setModelsText}
        rows={5}
        placeholder="one model id per line"
      />
      <TextRow
        label="api key env"
        value={env}
        onInput={setEnv}
        placeholder="OPENROUTER_API_KEY"
      />
    </FormShell>
  );
}
