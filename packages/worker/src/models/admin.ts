// The control panel model: seeded from page data, CRUD mutations through the
// admin api. The categories palette preview derives here from the model's
// categories and the open category form.
import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";

import { FALLBACK_COLOR } from "#/editor/markColors.ts";
import type { AdminConfigData } from "#/models/admin.data.ts";
import createAsyncState from "#/models/utils/asyncState.ts";
import { requestJson } from "#/models/utils/http.ts";
import { showToast } from "#/models/utils/toast.ts";

export type ModelPoolInput = Omit<ModelPool, "id">;
export type CategoryInput = Omit<Category, "id">;
export type ReviewPassInput = Omit<ReviewPass, "id">;

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

export const AdminConfigModel = createModel((data: AdminConfigData) => {
  const modelPools = signal<readonly ModelPool[]>(data.modelPools);
  const prompts = signal<readonly Prompt[]>(data.prompts);
  const categories = signal<readonly Category[]>(data.categories);
  const reviewPasses = signal<readonly ReviewPass[]>(data.reviewPasses);
  const activeReviewPassId = signal<string | undefined>(data.activeReviewPassId);
  const [run, { loading, error }] = createAsyncState();

  // Palette rows: a row per category (the edited row shows the live color),
  // a "(new)" row while creating, then the fallback row for unlabeled marks.
  const swatchEntries = computed<SwatchEntry[]>(() => {
    const preview = categoryPreview.value;
    const entries: SwatchEntry[] = categories.value.map(({ id, label, color }) => ({
      key: id,
      label,
      color: preview && id === preview.id ? preview.color : (color ?? FALLBACK_COLOR),
    }));
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

  async function load() {
    const result = await run(async () => {
      const res = await requestJson<AdminConfigData>("GET", "/api/admin/config");
      if (!res.ok || res.data === undefined) {
        throw new Error(res.message ?? `config load failed with ${res.status}`);
      }
      return res.data;
    });
    if (result) {
      modelPools.value = result.modelPools;
      prompts.value = result.prompts;
      categories.value = result.categories;
      reviewPasses.value = result.reviewPasses;
      activeReviewPassId.value = result.activeReviewPassId;
    }
  }

  const [mutateRun, { loading: mutating, error: mutateError }] = createAsyncState();

  async function mutate(mutation: () => Promise<void>): Promise<boolean> {
    const done = await mutateRun(async () => {
      await mutation();
      return true as const;
    });
    if (done !== true) {
      if (mutateError.value) showToast(mutateError.value, "error");
      return false;
    }
    await load();
    return true;
  }

  async function send(
    method: "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<void> {
    const res = await requestJson(method, path, body);
    if (!res.ok) {
      throw new Error(res.message ?? `${method} ${path} failed with ${res.status}`);
    }
  }

  const post = (path: string, body: unknown) => mutate(() => send("POST", path, body));
  const put = (path: string, body: unknown) => mutate(() => send("PUT", path, body));
  const del = (path: string) => mutate(() => send("DELETE", path));

  const createModelPool = (input: ModelPoolInput) => post("/api/admin/model-pools", input);

  const updateModelPool = (id: string, input: ModelPoolInput) =>
    put(`/api/admin/model-pools/${encodeURIComponent(id)}`, input);

  const deleteModelPool = (id: string) => del(`/api/admin/model-pools/${encodeURIComponent(id)}`);

  const createPrompt = (prompt: Prompt) => post("/api/admin/prompts", prompt);

  const updatePrompt = (key: string, prompt: Prompt) =>
    put(`/api/admin/prompts/${encodeURIComponent(key)}`, prompt);

  const deletePrompt = (key: string) => del(`/api/admin/prompts/${encodeURIComponent(key)}`);

  const createCategory = (input: CategoryInput) => post("/api/admin/categories", input);

  const updateCategory = (id: string, input: CategoryInput) =>
    put(`/api/admin/categories/${encodeURIComponent(id)}`, input);

  const deleteCategory = (id: string) => del(`/api/admin/categories/${encodeURIComponent(id)}`);

  const createReviewPass = (input: ReviewPassInput) => post("/api/admin/review-passes", input);

  const updateReviewPass = (id: string, input: ReviewPassInput) =>
    put(`/api/admin/review-passes/${encodeURIComponent(id)}`, input);

  const deleteReviewPass = (id: string) =>
    del(`/api/admin/review-passes/${encodeURIComponent(id)}`);

  const setActiveReviewPass = (reviewPassId: string) =>
    put("/api/admin/active-review-pass", { reviewPassId });

  return {
    modelPools,
    prompts,
    categories,
    reviewPasses,
    activeReviewPassId,
    swatchEntries,
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
