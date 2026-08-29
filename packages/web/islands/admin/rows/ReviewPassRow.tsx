import type { ReviewPass } from "@essayist/core";
import { CircleCheck, Pencil, Trash2 } from "lucide-preact";
import { ActionBtn, EntityCard } from "@/components/ui/EntityCard.tsx";
import { Field, List } from "@/components/ui/EntityRows.tsx";

export function ReviewPassRow({
  pass,
  active,
  busy,
  showActivate,
  onActivate,
  onEdit,
  onDelete,
}: {
  pass: ReviewPass;
  active: boolean;
  busy: boolean;
  showActivate: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
      <Field label="system" value={pass.systemPromptKey} />
      <Field label="directive" value={pass.directivePromptKey} />
      {pass.instructionsPromptKey && (
        <Field label="instructions" value={pass.instructionsPromptKey} />
      )}
      <List label="tools" items={pass.enabledTools} />
      <List label="categories" items={pass.allowedCategoryIds} />
      <Field label="max rounds" value={pass.maxRounds} />
    </EntityCard>
  );
}
