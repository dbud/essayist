import type { Category } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { get, modelData, namespace } from "@/signals/models.ts";
import { ensureOk } from "@/utils/ensureOk.ts";

export const categoriesNs = namespace<Category[]>("categories");

export const CategoriesModel = createModel(() => {
  const list = signal<Category[]>([]);

  const byLabel = computed(
    () => new Map(list.value.map((c) => [c.label, c] as const)),
  );

  const { loading, error, refresh } = modelData(
    categoriesNs,
    "singleton",
    (data) => {
      list.value = data;
    },
    async () => {
      const res = await fetch("/api/categories");
      await ensureOk(res);
      return (await res.json()) as Category[];
    },
  );

  return { list, byLabel, loading, error, refresh };
});

export type Categories = InstanceType<typeof CategoriesModel>;

export function getCategories(): Categories {
  return get(categoriesNs, "singleton", () => new CategoriesModel());
}
