import { computed, signal } from "@preact/signals";
import { FALLBACK_COLOR } from "@/editor/markColors.ts";
import { getCategories } from "@/signals/categories.ts";

export interface CategoryPreview {
  /** Category id when editing, null while creating. */
  id: string | null;
  label: string;
  color: string;
}

/** Live values from the open category form; null when closed. */
export const categoryPreview = signal<CategoryPreview | null>(null);

export interface SwatchEntry {
  key: string;
  label: string;
  color: string;
}

/** Palette rows: one per category (edited row shows the live color), a
 *  "(new)" row while creating, then the fallback row for unlabeled marks. */
export const swatchEntries = computed<SwatchEntry[]>(() => {
  const preview = categoryPreview.value;
  const entries: SwatchEntry[] = getCategories().list.value.map(
    ({ id, label, color }) => ({
      key: id,
      label,
      color:
        preview && id === preview.id
          ? preview.color
          : (color ?? FALLBACK_COLOR),
    }),
  );
  if (preview && preview.id === null) {
    entries.push({
      key: "__new",
      label: preview.label || "(new)",
      color: preview.color,
    });
  }
  entries.push({ key: "__ink", label: "(unlabeled)", color: FALLBACK_COLOR });
  return entries;
});
