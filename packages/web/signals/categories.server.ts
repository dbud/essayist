import type { Category } from "@essayist/core";
import { categoriesNs } from "@/signals/categories.ts";
import { registerLoader } from "@/signals/models.server.ts";
import { configStore } from "@/store.ts";

export function categoriesLoader(): Promise<Category[]> {
  return configStore.listCategories();
}

registerLoader(categoriesNs, () => categoriesLoader());
