// The control panel data model: the full admin config plus CRUD mutations.
// The categories palette preview lives here too; it derives from this model's
// categories and the open category form.
import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";

import { FALLBACK_COLOR } from "#/editor/markColors.ts";
import createAsyncState from "#/models/utils/asyncState.ts";
import { requestJson } from "#/models/utils/http.ts";
import { showToast } from "#/models/utils/toast.ts";

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

/** Palette rows: a row per category (the edited row shows the live color),
 * a "(new)" row while creating, then the fallback row for unlabeled marks. */
export const swatchEntries = computed<SwatchEntry[]>(() => {
  const preview = categoryPreview.value;
  const entries: SwatchEntry[] = getAdminConfig().categories.value.map(({ id, label, color }) => ({
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

export const AdminConfigModel = createModel(() => {
  const modelPools = signal<ModelPool[]>([]);
  const prompts = signal<Prompt[]>([]);
  const categories = signal<Category[]>([]);
  const reviewPasses = signal<ReviewPass[]>([]);
  const activeReviewPassId = signal<string | undefined>(undefined);
  const [run, { loading, error }] = createAsyncState(true);

  async function load() {
    const result = await run(async () => {
      const res = await requestJson<AdminConfig>("GET", "/api/admin/config");
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

  const createModelPool = (data: ModelPoolInput) => post("/api/admin/model-pools", data);

  const updateModelPool = (id: string, data: ModelPoolInput) =>
    put(`/api/admin/model-pools/${encodeURIComponent(id)}`, data);

  const deleteModelPool = (id: string) => del(`/api/admin/model-pools/${encodeURIComponent(id)}`);

  const createPrompt = (data: Prompt) => post("/api/admin/prompts", data);

  const updatePrompt = (key: string, data: Prompt) =>
    put(`/api/admin/prompts/${encodeURIComponent(key)}`, data);

  const deletePrompt = (key: string) => del(`/api/admin/prompts/${encodeURIComponent(key)}`);

  const createCategory = (data: CategoryInput) => post("/api/admin/categories", data);

  const updateCategory = (id: string, data: CategoryInput) =>
    put(`/api/admin/categories/${encodeURIComponent(id)}`, data);

  const deleteCategory = (id: string) => del(`/api/admin/categories/${encodeURIComponent(id)}`);

  const createReviewPass = (data: ReviewPassInput) => post("/api/admin/review-passes", data);

  const updateReviewPass = (id: string, data: ReviewPassInput) =>
    put(`/api/admin/review-passes/${encodeURIComponent(id)}`, data);

  const deleteReviewPass = (id: string) =>
    del(`/api/admin/review-passes/${encodeURIComponent(id)}`);

  const setActiveReviewPass = (reviewPassId: string) =>
    put("/api/admin/active-review-pass", { reviewPassId });

  if (!import.meta.env.SSR) void load();

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

export type AdminModel = InstanceType<typeof AdminConfigModel>;

const cache = new Map<string, AdminModel>();

export function getAdminConfig(): AdminModel {
  return cache.getOrInsertComputed("admin", () => new AdminConfigModel());
}
