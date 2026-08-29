import type { Prompt } from "@essayist/core";
import { Pencil, Trash2 } from "lucide-preact";
import { ActionBtn, EntityCard } from "@/components/ui/EntityCard.tsx";
import { Field, List } from "@/components/ui/EntityRows.tsx";

export function PromptRow({
  prompt,
  busy,
  onEdit,
  onDelete,
}: {
  prompt: Prompt;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <EntityCard
      title={<span>{prompt.key}</span>}
      actions={
        <>
          <ActionBtn
            label="Edit prompt"
            icon={Pencil}
            disabled={busy}
            onClick={onEdit}
          />
          <ActionBtn
            label="Delete prompt"
            icon={Trash2}
            disabled={busy}
            onClick={onDelete}
          />
        </>
      }
    >
      <Field label="body" value={prompt.body} />
      {prompt.variables && prompt.variables.length > 0 && (
        <List label="variables" items={prompt.variables} />
      )}
    </EntityCard>
  );
}
