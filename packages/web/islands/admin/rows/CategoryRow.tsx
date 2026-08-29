import type { Category } from "@essayist/core";
import { Pencil, Trash2 } from "lucide-preact";
import { ActionBtn, EntityCard } from "@/components/ui/EntityCard.tsx";
import { Field } from "@/components/ui/EntityRows.tsx";

export function CategoryRow({
  category,
  busy,
  onEdit,
  onDelete,
}: {
  category: Category;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <EntityCard
      title={<span>{category.label}</span>}
      id={category.id}
      actions={
        <>
          <ActionBtn
            label="Edit category"
            icon={Pencil}
            disabled={busy}
            onClick={onEdit}
          />
          <ActionBtn
            label="Delete category"
            icon={Trash2}
            disabled={busy}
            onClick={onDelete}
          />
        </>
      }
    >
      {category.description && (
        <Field label="description" value={category.description} />
      )}
    </EntityCard>
  );
}
