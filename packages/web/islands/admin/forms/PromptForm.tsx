import { extractVariables, type Prompt } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { List } from "@/components/ui/EntityRows.tsx";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { TextareaRow } from "@/components/ui/forms/TextareaRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
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
  const [error, setError] = useState<string | null>(null);
  const variables = extractVariables(body);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!key.trim()) return setError("Key is required.");
    if (!body.trim()) return setError("Body is required.");
    const data: Prompt = {
      key: entity?.key ?? key.trim(),
      body,
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
      {variables.length > 0 && <List label="variables" items={variables} />}
    </FormShell>
  );
}
