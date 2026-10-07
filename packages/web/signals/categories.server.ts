import type { Category } from "@essayist/core";
import { ReviewConfig } from "@essayist/core";
import { categoriesNs } from "@/signals/categories.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { kv, runtime } from "@/store.ts";
import { cached } from "@/utils/kvCache.server.ts";

const cache = cached<Category[]>(
  "categories",
  () => runtime.runPromise(ReviewConfig.use((store) => store.listCategories())),
  {
    ttlMs: 24 * 60 * 60_000, // 1d
    watch: { kv, key: ["cache_epoch", "categories"] },
  },
);

export function categoriesLoader(): Promise<Category[]> {
  return cache.get();
}

export async function saveCategory(category: Category): Promise<void> {
  await runtime.runPromise(
    ReviewConfig.use((store) => store.saveCategory(category)),
  );
  await cache.invalidate();
}

export async function deleteCategory(id: string): Promise<void> {
  await runtime.runPromise(
    ReviewConfig.use((store) => store.deleteCategory(id)),
  );
  await cache.invalidate();
}

registerLoader(categoriesNs, () => categoriesLoader());
