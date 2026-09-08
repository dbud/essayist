import type { Category } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";

export const CategoriesModel = createModel(() => {
  const list = signal<Category[]>([]);
  const [run, { loading, error }] = createAsyncState(true);

  const byLabel = computed(
    () => new Map(list.value.map((c) => [c.label, c] as const)),
  );

  async function load() {
    const result = await run(async () => {
      const res = await fetch("/api/categories");
      await ensureOk(res);
      return (await res.json()) as Category[];
    });
    if (result) list.value = result;
  }

  if (IS_BROWSER) void load();

  return { list, byLabel, loading, error, reload: load };
});

export const categories = new CategoriesModel();
