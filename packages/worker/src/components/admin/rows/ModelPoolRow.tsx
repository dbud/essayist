import { Pencil, Trash2 } from "lucide-preact";

import { ActionBtn, EntityCard } from "#/components/admin/ui/EntityCard.tsx";
import { List } from "#/components/admin/ui/EntityRows.tsx";
import type { ModelPoolData } from "#/models/admin.data.ts";

export function ModelPoolRow({
  pool,
  busy,
  onEdit,
  onDelete,
}: {
  pool: ModelPoolData;
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
          <ActionBtn label="Edit model pool" icon={Pencil} disabled={busy} onClick={onEdit} />
          <ActionBtn label="Delete model pool" icon={Trash2} disabled={busy} onClick={onDelete} />
        </>
      }
    >
      <List label="models" items={pool.models} />
    </EntityCard>
  );
}
