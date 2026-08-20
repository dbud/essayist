import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import createAsyncState from "@/utils/asyncState.ts";

export interface AdminConfig {
  modelPools: ModelPool[];
  prompts: Prompt[];
  categories: Category[];
  reviewPasses: ReviewPass[];
  activeReviewPassId?: string;
}

export const AdminConfigModel = createModel(() => {
  const modelPools = signal<ModelPool[]>([]);
  const prompts = signal<Prompt[]>([]);
  const categories = signal<Category[]>([]);
  const reviewPasses = signal<ReviewPass[]>([]);
  const activeReviewPassId = signal<string | undefined>(undefined);
  const [run, { loading, error }] = createAsyncState(true);

  async function load() {
    const result = await run(async () => {
      const res = await fetch("/api/admin/config");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as AdminConfig;
    });
    if (result) {
      modelPools.value = result.modelPools;
      prompts.value = result.prompts;
      categories.value = result.categories;
      reviewPasses.value = result.reviewPasses;
      activeReviewPassId.value = result.activeReviewPassId;
    }
  }

  if (IS_BROWSER) void load();

  return {
    modelPools,
    prompts,
    categories,
    reviewPasses,
    activeReviewPassId,
    loading,
    error,
    reload: load,
  };
});

const cache = new Map<string, InstanceType<typeof AdminConfigModel>>();

export function getAdminConfig() {
  return cache.getOrInsertComputed("admin", () => new AdminConfigModel());
}
