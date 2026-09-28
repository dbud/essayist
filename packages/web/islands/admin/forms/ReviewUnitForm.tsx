import type { ReviewPass, ReviewUnit } from "@essayist/core";
import type { Signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { FormShell } from "@/components/ui/forms/FormShell.tsx";
import { type Option, OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import { TextRow } from "@/components/ui/forms/TextRow.tsx";
import Slider from "@/components/ui/Slider.tsx";
import { getAdminConfig } from "@/signals/admin.ts";

const NONE: Option = { value: "", label: "none" };

function PromptPreview({ text }: { text?: string }) {
  if (!text) return null;
  return <div class="cell--data col-span-2 min-w-0">{text}</div>;
}

export function ReviewUnitForm({
  pass,
  unitId,
  open,
}: {
  pass: ReviewPass;
  unitId?: string;
  open: Signal<boolean>;
}) {
  const admin = getAdminConfig();
  const unit = pass.units.find((u) => u.id === unitId);
  const [id, setId] = useState(unit?.id ?? "");
  const [promptKey, setPromptKey] = useState(
    unit?.promptKey ?? admin.prompts.value[0]?.key ?? "",
  );
  const [instructionsKey, setInstructionsKey] = useState(
    unit?.instructionsPromptKey ?? "",
  );
  const [poolOverride, setPoolOverride] = useState(unit?.modelPoolId ?? "");
  const [inputs, setInputs] = useState<string[]>(unit?.inputs ?? []);
  const [marks, setMarks] = useState(unit?.attempt !== undefined);
  const [categoryIds, setCategoryIds] = useState<string[]>(
    unit?.attempt?.allowedCategoryIds ?? [],
  );
  const [rounds, setRounds] = useState(unit?.attempt?.repairRounds ?? 1);
  const [summary, setSummary] = useState(unit?.summary === true);
  const [error, setError] = useState<string | null>(null);

  // Inputs may only reference units that precede this one.
  const index = unit ? pass.units.indexOf(unit) : pass.units.length;
  const inputOptions: Option[] = pass.units
    .slice(0, index)
    .map((u) => ({ value: u.id, label: u.id }));

  function toggleRole(value: string) {
    if (value === "marks") {
      const next = !marks;
      setMarks(next);
      if (next) setSummary(false);
    } else {
      const next = !summary;
      setSummary(next);
      if (next) setMarks(false);
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = id.trim();
    if (!trimmed) return setError("Unit id is required.");
    if (trimmed.includes(".")) {
      return setError('Unit id must not contain ".".');
    }
    if (pass.units.some((u) => u.id === trimmed && u.id !== unitId)) {
      return setError(`Unit id "${trimmed}" is already used in this pass.`);
    }
    if (!promptKey) return setError("Select a prompt.");
    if (marks && categoryIds.length === 0) {
      return setError("Select at least one category for marks.");
    }
    const next: ReviewUnit = {
      id: trimmed,
      promptKey,
      ...(instructionsKey ? { instructionsPromptKey: instructionsKey } : {}),
      ...(poolOverride ? { modelPoolId: poolOverride } : {}),
      ...(inputs.length > 0 ? { inputs } : {}),
      ...(marks && {
        attempt: {
          allowedCategoryIds: [...categoryIds],
          repairRounds: rounds,
        },
      }),
      ...(summary && { summary: true }),
    };
    const units = unit
      ? pass.units.map((u) => (u.id === unit.id ? next : u))
      : [...pass.units, next];
    const ok = await admin.updateReviewPass(pass.id, { ...pass, units });
    if (ok) open.value = false;
  }

  const promptOptions: Option[] = admin.prompts.value.map((p) => ({
    value: p.key,
    label: p.key,
  }));
  const poolOptions: Option[] = admin.modelPools.value.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const promptBody = (key: string) =>
    admin.prompts.value.find((p) => p.key === key)?.body;
  const categoryOptions: Option[] = admin.categories.value.map((c) => ({
    value: c.id,
    label: c.label,
  }));

  return (
    <FormShell
      title={unit ? `Edit unit ${unit.id}` : `New unit in ${pass.name}`}
      submitLabel={unit ? "Save" : "Create"}
      submitting={admin.mutating.value}
      onCancel={() => (open.value = false)}
      error={error}
      onSubmit={handleSubmit}
    >
      {!unit && <TextRow label="id" value={id} onInput={setId} />}
      <OptionsRow
        kind="radio"
        name="unit-prompt"
        label="prompt"
        options={promptOptions}
        values={[promptKey]}
        onToggle={setPromptKey}
      />
      <PromptPreview text={promptBody(promptKey)} />
      <OptionsRow
        kind="radio"
        name="unit-instructions"
        label="instructions"
        options={[NONE, ...promptOptions]}
        values={[instructionsKey]}
        onToggle={setInstructionsKey}
      />
      <PromptPreview text={promptBody(instructionsKey)} />
      <OptionsRow
        kind="radio"
        name="unit-pool"
        label="pool override"
        options={[NONE, ...poolOptions]}
        values={[poolOverride]}
        onToggle={setPoolOverride}
      />
      {inputOptions.length > 0 && (
        <OptionsRow
          kind="checkbox"
          name="unit-inputs"
          label="inputs"
          options={inputOptions}
          values={inputs}
          onToggle={(value) =>
            setInputs((prev) =>
              prev.includes(value)
                ? prev.filter((i) => i !== value)
                : [...prev, value],
            )
          }
        />
      )}
      <OptionsRow
        kind="checkbox"
        name="unit-role"
        label="role"
        options={[
          { value: "marks", label: "marks" },
          { value: "summary", label: "summary" },
        ]}
        values={[...(marks ? ["marks"] : []), ...(summary ? ["summary"] : [])]}
        onToggle={toggleRole}
      />
      {marks && (
        <>
          <OptionsRow
            kind="checkbox"
            name="unit-categories"
            label="categories"
            options={categoryOptions}
            values={categoryIds}
            onToggle={(value) =>
              setCategoryIds((prev) =>
                prev.includes(value)
                  ? prev.filter((c) => c !== value)
                  : [...prev, value],
              )
            }
          />
          <div class="cell col-span-2">
            <Slider
              class="max-w-72"
              label="repair rounds"
              values={[0, 1, 2, 3, 4, 5]}
              value={rounds}
              onChange={setRounds}
            />
          </div>
        </>
      )}
    </FormShell>
  );
}
