import type { Prompt, ReviewPass } from "@essayist/core";
import { CircleCheck, Pencil, Plus, Trash2 } from "lucide-preact";
import { Fragment } from "preact";
import { ActionBtn, EntityCard } from "@/components/ui/EntityCard.tsx";
import { Field, List } from "@/components/ui/EntityRows.tsx";

function PromptField({ label, prompt }: { label: string; prompt?: Prompt }) {
  return (
    <>
      <div class={`cell--data text-ink/60 ${prompt ? "row-span-2" : ""}`}>
        {label}
      </div>
      <div class="cell--data min-w-0">{prompt?.key ?? "missing"}</div>
      {prompt && <div class="cell--data min-w-0">{prompt.body}</div>}
    </>
  );
}

export function ReviewPassRow({
  pass,
  prompts,
  active,
  busy,
  showActivate,
  onActivate,
  onEdit,
  onDelete,
  onDeleteUnit,
  onAddUnit,
  onEditUnit,
}: {
  pass: ReviewPass;
  prompts: Prompt[];
  active: boolean;
  busy: boolean;
  showActivate: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteUnit: (unitId: string) => void;
  onAddUnit: () => void;
  onEditUnit: (unitId: string) => void;
}) {
  const byKey = (key: string) => prompts.find((p) => p.key === key);
  return (
    <EntityCard
      title={
        <>
          <span>{pass.name}</span>
          {active && (
            <span class="badge badge--success self-start">active</span>
          )}
        </>
      }
      id={pass.id}
      actions={
        <>
          {showActivate && (
            <ActionBtn
              label="Set active review pass"
              icon={CircleCheck}
              disabled={busy}
              onClick={onActivate}
            />
          )}
          <ActionBtn
            label="Edit review pass"
            icon={Pencil}
            disabled={busy}
            onClick={onEdit}
          />
          <ActionBtn
            label="Add unit to pass"
            icon={Plus}
            disabled={busy}
            onClick={onAddUnit}
          />
          <ActionBtn
            label="Delete review pass"
            icon={Trash2}
            disabled={busy}
            onClick={onDelete}
          />
        </>
      }
    >
      <Field label="pool" value={pass.modelPoolId} />
      <PromptField label="system" prompt={byKey(pass.systemPromptKey)} />
      {pass.units.map((unit) => (
        <Fragment key={unit.id}>
          <div class="col-span-2 flex stack">
            <div class="flex flex-1 cell--data cell--ink gap-2">
              <span>{unit.id}</span>
              {unit.attempt && <span class="badge self-start">marks</span>}
              {unit.summary && <span class="badge self-start">summary</span>}
            </div>
            <ActionBtn
              label={`Edit unit ${unit.id}`}
              icon={Pencil}
              disabled={busy}
              onClick={() => onEditUnit(unit.id)}
            />
            <ActionBtn
              label={`Delete unit ${unit.id}`}
              icon={Trash2}
              disabled={busy}
              onClick={() => onDeleteUnit(unit.id)}
            />
          </div>
          <PromptField label="prompt" prompt={byKey(unit.promptKey)} />
          {unit.instructionsPromptKey && (
            <PromptField
              label="instructions"
              prompt={byKey(unit.instructionsPromptKey)}
            />
          )}
          {unit.modelPoolId && (
            <Field label="pool override" value={unit.modelPoolId} />
          )}
          {unit.inputs && unit.inputs.length > 0 && (
            <List label="inputs" items={unit.inputs} />
          )}
          {unit.attempt && (
            <>
              <List
                label="categories"
                items={unit.attempt.allowedCategoryIds}
              />
              <Field
                label="repair rounds"
                value={unit.attempt.repairRounds ?? 1}
              />
            </>
          )}
        </Fragment>
      ))}
    </EntityCard>
  );
}
