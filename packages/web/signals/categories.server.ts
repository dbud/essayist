import type { Category } from "@essayist/core";
import { categoriesNs } from "@/signals/categories.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { configStore } from "@/store.ts";
import { cached } from "@/utils/kvCache.server.ts";

const cache = cached<Category[]>(
  "categories",
  () => configStore.listCategories(),
  // Mark colors are display-only, so cross-isolate staleness within the
  // TTL is acceptable.
  { ttlMs: 60_000 },
);

export function categoriesLoader(): Promise<Category[]> {
  return cache.get();
}

// Category writes go through these wrappers so invalidation always
// travels with the write.
export async function saveCategory(category: Category): Promise<void> {
  await configStore.saveCategory(category);
  cache.invalidate();
}

export async function deleteCategory(id: string): Promise<void> {
  await configStore.deleteCategory(id);
  cache.invalidate();
}

registerLoader(categoriesNs, () => categoriesLoader());
