import type { ReviewPass } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { type Option, OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import { getAdminConfig, type ReviewPassInput } from "@/signals/admin.ts";

function PromptPreview({ text }: { text?: string }) {
  if (!text) return null;
  return <div class="cell--data col-span-2 min-w-0">{text}</div>;
}

export function ReviewPassForm({
  entity,
  open,
}: {
  entity?: ReviewPass;
  open: Signal<boolean>;
}) {
  const admin = getAdminConfig();
  const [name, setName] = useState(entity?.name ?? "");
  const [poolId, setPoolId] = useState(
    entity?.modelPoolId ?? admin.modelPools.value[0]?.id ?? "",
  );
  const [systemKey, setSystemKey] = useState(
    entity?.systemPromptKey ?? admin.prompts.value[0]?.key ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    if (!poolId) return setError("Select a model pool.");
    if (!systemKey) return setError("Select a system prompt.");
    const base: ReviewPassInput = {
      name: name.trim(),
      modelPoolId: poolId,
      systemPromptKey: systemKey,
      units: entity?.units ?? [],
      ...(entity?.variables && { variables: entity.variables }),
    };
    const ok = entity
      ? await admin.updateReviewPass(entity.id, base)
      : await admin.createReviewPass(base);
    if (ok) open.value = false;
  }

  const poolOptions: Option[] = admin.modelPools.value.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const promptOptions: Option[] = admin.prompts.value.map((p) => ({
    value: p.key,
    label: p.key,
  }));
  const promptBody = (key: string) =>
    admin.prompts.value.find((p) => p.key === key)?.body;

  return (
    <FormShell
      title={entity ? "Edit review pass" : "New review pass"}
      submitLabel={entity ? "Save" : "Create"}
      submitting={admin.mutating.value}
      onCancel={() => (open.value = false)}
      error={error}
      onSubmit={handleSubmit}
    >
      <TextRow label="name" value={name} onInput={setName} />
      <OptionsRow
        kind="radio"
        name="model-pool"
        label="model pool"
        options={poolOptions}
        values={[poolId]}
        onToggle={setPoolId}
      />
      <OptionsRow
        kind="radio"
        name="system-prompt"
        label="system prompt"
        options={promptOptions}
        values={[systemKey]}
        onToggle={setSystemKey}
      />
      <PromptPreview text={promptBody(systemKey)} />
    </FormShell>
  );
}
