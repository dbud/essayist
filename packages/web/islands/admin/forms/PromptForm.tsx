import type { Prompt } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { TextareaRow } from "@/components/ui/forms/TextareaRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import { lines } from "@/islands/admin/forms/lines.ts";
import { getAdminConfig } from "@/signals/admin.ts";

export function PromptForm({
  entity,
  open,
}: {
  entity?: Prompt;
  open: Signal<boolean>;
}) {
  const admin = getAdminConfig();
  const [key, setKey] = useState(entity?.key ?? "");
  const [body, setBody] = useState(entity?.body ?? "");
  const [variablesText, setVariablesText] = useState(
    (entity?.variables ?? []).join("\n"),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!key.trim()) return setError("Key is required.");
    if (!body.trim()) return setError("Body is required.");
    const variables = lines(variablesText);
    const data: Prompt = {
      key: entity?.key ?? key.trim(),
      body,
      ...(variables.length > 0 ? { variables } : {}),
    };
    const ok = entity
      ? await admin.updatePrompt(entity.key, data)
      : await admin.createPrompt(data);
    if (ok) open.value = false;
  }

  return (
    <FormShell
      title={entity ? "Edit prompt" : "New prompt"}
      submitLabel={entity ? "Save" : "Create"}
      submitting={admin.mutating.value}
      onCancel={() => (open.value = false)}
      error={error}
      onSubmit={handleSubmit}
    >
      <TextRow
        label="key"
        value={key}
        onInput={setKey}
        disabled={entity !== undefined}
      />
      <TextareaRow
        label="body"
        value={body}
        onInput={setBody}
        rows={8}
        placeholder="Prompt template with {{var}} placeholders"
      />
      <TextareaRow
        label="variables (one per line)"
        value={variablesText}
        onInput={setVariablesText}
        rows={3}
      />
    </FormShell>
  );
}
