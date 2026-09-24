import type { PersistenceAdapter } from "@/persistence/mod.ts";
import type { Category, ModelPool, Prompt, ReviewPass } from "./types.ts";

// Key layout:
//   ["cfg","model_pools",  id]   -> ModelPool
//   ["cfg","prompts",      key]  -> Prompt
//   ["cfg","categories",   id]   -> Category
//   ["cfg","review_passes",id]   -> ReviewPass
//   ["cfg","active"]             -> { reviewPassId }
const CFG = "cfg";
const MODEL_POOLS = "model_pools";
const PROMPTS = "prompts";
const CATEGORIES = "categories";
const REVIEW_PASSES = "review_passes";
const ACTIVE = "active";

/** Active review-pass pin. */
interface ActivePin {
  reviewPassId: string;
}

/** CRUD over the config entities in KV. Resolution lives in resolve.ts. */
export class ConfigStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  // -- model pools --

  async getModelPool(id: string): Promise<ModelPool | undefined> {
    return (await this.#adapter.get<ModelPool>([CFG, MODEL_POOLS, id]))?.value;
  }
  async saveModelPool(p: ModelPool): Promise<void> {
    await this.#adapter.set([CFG, MODEL_POOLS, p.id], p);
  }
  async deleteModelPool(id: string): Promise<void> {
    await this.#adapter.delete([CFG, MODEL_POOLS, id]);
  }
  async listModelPools(): Promise<ModelPool[]> {
    const { entries } = await this.#adapter.list<ModelPool>([CFG, MODEL_POOLS]);
    return entries.map((e) => e.value);
  }

  // -- prompts --

  async getPrompt(key: string): Promise<Prompt | undefined> {
    return (await this.#adapter.get<Prompt>([CFG, PROMPTS, key]))?.value;
  }
  async savePrompt(p: Prompt): Promise<void> {
    await this.#adapter.set([CFG, PROMPTS, p.key], p);
  }
  async deletePrompt(key: string): Promise<void> {
    await this.#adapter.delete([CFG, PROMPTS, key]);
  }
  async listPrompts(): Promise<Prompt[]> {
    const { entries } = await this.#adapter.list<Prompt>([CFG, PROMPTS]);
    return entries.map((e) => e.value);
  }

  // -- categories --

  async getCategory(id: string): Promise<Category | undefined> {
    return (await this.#adapter.get<Category>([CFG, CATEGORIES, id]))?.value;
  }
  async saveCategory(c: Category): Promise<void> {
    await this.#adapter.set([CFG, CATEGORIES, c.id], c);
  }
  async deleteCategory(id: string): Promise<void> {
    await this.#adapter.delete([CFG, CATEGORIES, id]);
  }
  async listCategories(): Promise<Category[]> {
    const { entries } = await this.#adapter.list<Category>([CFG, CATEGORIES]);
    return entries.map((e) => e.value);
  }

  /** Batch fetch; results align with `ids`, undefined where absent. */
  async getCategories(ids: string[]): Promise<(Category | undefined)[]> {
    const entries = await this.#adapter.getMany<Category>(
      ids.map((id) => [CFG, CATEGORIES, id]),
    );
    return entries.map((e) => e?.value);
  }

  // -- review passes --

  async getReviewPass(id: string): Promise<ReviewPass | undefined> {
    return (await this.#adapter.get<ReviewPass>([CFG, REVIEW_PASSES, id]))
      ?.value;
  }
  async saveReviewPass(r: ReviewPass): Promise<void> {
    await this.#adapter.set([CFG, REVIEW_PASSES, r.id], r);
  }
  async deleteReviewPass(id: string): Promise<void> {
    await this.#adapter.delete([CFG, REVIEW_PASSES, id]);
  }
  async listReviewPasses(): Promise<ReviewPass[]> {
    const { entries } = await this.#adapter.list<ReviewPass>([
      CFG,
      REVIEW_PASSES,
    ]);
    return entries.map((e) => e.value);
  }

  // -- active review-pass pin --

  async getActiveReviewPassId(): Promise<string | undefined> {
    return (await this.#adapter.get<ActivePin>([CFG, ACTIVE]))?.value
      ?.reviewPassId;
  }

  /** Pin the active review pass. */
  async setActiveReviewPass(reviewPassId: string): Promise<void> {
    await this.#adapter.set([CFG, ACTIVE], {
      reviewPassId,
    } satisfies ActivePin);
  }

  async clearActiveReviewPass(): Promise<void> {
    await this.#adapter.delete([CFG, ACTIVE]);
  }
}
