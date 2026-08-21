import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import createAsyncState from "@/utils/asyncState.ts";
import { createMutations } from "@/utils/createMutations.ts";

export interface AdminConfig {
  modelPools: ModelPool[];
  prompts: Prompt[];
  categories: Category[];
  reviewPasses: ReviewPass[];
  activeReviewPassId?: string;
}

export type ModelPoolInput = Omit<ModelPool, "id">;
export type CategoryInput = Omit<Category, "id">;
export type ReviewPassInput = Omit<ReviewPass, "id">;

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

  const { mutating, post, put, del } = createMutations(load);

  // -- model pools --

  const createModelPool = (data: ModelPoolInput) =>
    post("/api/admin/model-pools", data);

  const updateModelPool = (id: string, data: ModelPoolInput) =>
    put(`/api/admin/model-pools/${encodeURIComponent(id)}`, data);

  const deleteModelPool = (id: string) =>
    del(`/api/admin/model-pools/${encodeURIComponent(id)}`);

  // -- prompts --

  const createPrompt = (data: Prompt) => post("/api/admin/prompts", data);

  const updatePrompt = (key: string, data: Prompt) =>
    put(`/api/admin/prompts/${encodeURIComponent(key)}`, data);

  const deletePrompt = (key: string) =>
    del(`/api/admin/prompts/${encodeURIComponent(key)}`);

  // -- categories --

  const createCategory = (data: CategoryInput) =>
    post("/api/admin/categories", data);

  const updateCategory = (id: string, data: CategoryInput) =>
    put(`/api/admin/categories/${encodeURIComponent(id)}`, data);

  const deleteCategory = (id: string) =>
    del(`/api/admin/categories/${encodeURIComponent(id)}`);

  // -- review passes --

  const createReviewPass = (data: ReviewPassInput) =>
    post("/api/admin/review-passes", data);

  const updateReviewPass = (id: string, data: ReviewPassInput) =>
    put(`/api/admin/review-passes/${encodeURIComponent(id)}`, data);

  const deleteReviewPass = (id: string) =>
    del(`/api/admin/review-passes/${encodeURIComponent(id)}`);

  // -- active review pass --

  const setActiveReviewPass = (reviewPassId: string) =>
    put("/api/admin/active-review-pass", { reviewPassId });

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
    mutating,
    createModelPool,
    updateModelPool,
    deleteModelPool,
    createPrompt,
    updatePrompt,
    deletePrompt,
    createCategory,
    updateCategory,
    deleteCategory,
    createReviewPass,
    updateReviewPass,
    deleteReviewPass,
    setActiveReviewPass,
  };
});

const cache = new Map<string, InstanceType<typeof AdminConfigModel>>();

export function getAdminConfig() {
  return cache.getOrInsertComputed("admin", () => new AdminConfigModel());
}
