import type { ModelPool } from "@essayist/core";
import { Pencil, Trash2 } from "lucide-preact";
import { ActionBtn, EntityCard } from "@/components/ui/EntityCard.tsx";
import { Field, List } from "@/components/ui/EntityRows.tsx";

export function ModelPoolRow({
  pool,
  busy,
  onEdit,
  onDelete,
}: {
  pool: ModelPool;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <EntityCard
      title={<span>{pool.name}</span>}
      id={pool.id}
      actions={
        <>
          <ActionBtn
            label="Edit model pool"
            icon={Pencil}
            disabled={busy}
            onClick={onEdit}
          />
          <ActionBtn
            label="Delete model pool"
            icon={Trash2}
            disabled={busy}
            onClick={onDelete}
          />
        </>
      }
    >
      <List label="models" items={pool.models} />
      {pool.apiKeyEnvKey && (
        <Field label="api key env" value={pool.apiKeyEnvKey} />
      )}
    </EntityCard>
  );
}
