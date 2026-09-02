import type { ReviewPass, ToolName } from "@essayist/core";
import { ToolNameSchema } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { type Option, OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import { TextareaRow } from "@/components/ui/forms/TextareaRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import { getAdminConfig, type ReviewPassInput } from "@/signals/admin.ts";

const TOOLS: ToolName[] = ToolNameSchema.options;

const NONE: Option = { value: "", label: "none" };

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
  const [directiveKey, setDirectiveKey] = useState(
    entity?.directivePromptKey ?? admin.prompts.value[0]?.key ?? "",
  );
  const [instructionsKey, setInstructionsKey] = useState(
    entity?.instructionsPromptKey ?? "",
  );
  const [instructions, setInstructions] = useState(entity?.instructions ?? "");
  const [tools, setTools] = useState<ToolName[]>(
    entity?.enabledTools ??
      (["read_file", "list_files", "grep", "mark"] as ToolName[]),
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(
    entity?.allowedCategoryIds ?? [],
  );
  const [maxRoundsText, setMaxRoundsText] = useState(
    String(entity?.maxRounds ?? 5),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required.");
    if (!poolId) return setError("Select a model pool.");
    if (!systemKey || !directiveKey) {
      return setError("Select system and directive prompt keys.");
    }
    const rounds = Number(maxRoundsText);
    if (!Number.isInteger(rounds) || rounds < 1) {
      return setError("Max rounds must be a positive integer.");
    }
    const base: ReviewPassInput = {
      name: name.trim(),
      modelPoolId: poolId,
      systemPromptKey: systemKey,
      directivePromptKey: directiveKey,
      instructionsPromptKey: instructionsKey || undefined,
      instructions: instructions.trim() || undefined,
      enabledTools: [...tools],
      allowedCategoryIds: [...categoryIds],
      maxRounds: rounds,
    };
    const data = entity ? { ...entity, ...base } : base;
    const ok = entity
      ? await admin.updateReviewPass(entity.id, data)
      : await admin.createReviewPass(data);
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
  const categoryOptions: Option[] = admin.categories.value.map((c) => ({
    value: c.id,
    label: c.label,
  }));

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
      <OptionsRow
        kind="radio"
        name="directive-prompt"
        label="directive prompt"
        options={promptOptions}
        values={[directiveKey]}
        onToggle={setDirectiveKey}
      />
      <PromptPreview text={promptBody(directiveKey)} />
      <OptionsRow
        kind="radio"
        name="instructions-prompt"
        label="instructions prompt"
        options={[NONE, ...promptOptions]}
        values={[instructionsKey]}
        onToggle={setInstructionsKey}
      />
      <PromptPreview text={promptBody(instructionsKey)} />
      <TextareaRow
        label="instructions"
        value={instructions}
        onInput={setInstructions}
        rows={4}
      />
      <OptionsRow
        kind="checkbox"
        name="enabled-tools"
        label="enabled tools"
        options={TOOLS.map((t) => ({ value: t, label: t }))}
        values={tools}
        onToggle={(v) =>
          setTools((prev) => {
            const tool = v as ToolName;
            return prev.includes(tool)
              ? prev.filter((t) => t !== tool)
              : [...prev, tool];
          })
        }
      />
      <OptionsRow
        kind="checkbox"
        name="allowed-categories"
        label="allowed categories"
        options={categoryOptions}
        values={categoryIds}
        onToggle={(v) =>
          setCategoryIds((prev) =>
            prev.includes(v) ? prev.filter((c) => c !== v) : [...prev, v],
          )
        }
      />
      <TextRow
        label="max rounds"
        value={maxRoundsText}
        onInput={setMaxRoundsText}
        type="number"
      />
    </FormShell>
  );
}
