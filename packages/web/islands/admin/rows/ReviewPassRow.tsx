import type { Prompt, ReviewPass } from "@essayist/core";
import { CircleCheck, Pencil, Trash2 } from "lucide-preact";
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
}: {
  pass: ReviewPass;
  prompts: Prompt[];
  active: boolean;
  busy: boolean;
  showActivate: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
      <PromptField label="directive" prompt={byKey(pass.directivePromptKey)} />
      {pass.instructionsPromptKey && (
        <PromptField
          label="instructions"
          prompt={byKey(pass.instructionsPromptKey)}
        />
      )}
      <List label="tools" items={pass.enabledTools} />
      <List label="categories" items={pass.allowedCategoryIds} />
      <Field label="max rounds" value={pass.maxRounds} />
    </EntityCard>
  );
}
