import type { Key, PersistenceAdapter } from "@/persistence/mod.ts";
import { renderPrompt } from "./template.ts";
import type {
  Category,
  ModelPool,
  Prompt,
  ResolvedReviewPass,
  ReviewPass,
} from "./types.ts";

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

const DEFAULT_API_KEY_ENV = "OPENROUTER_API_KEY";

/** Active review-pass pin. */
interface ActivePin {
  reviewPassId: string;
}

/** Thrown by resolveActiveReviewPass on missing config. */
export class ConfigMissingError extends Error {
  constructor(what: string) {
    super(`Config missing: ${what}`);
  }
}

/** CRUD + resolution for config entities. */
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

  // -- resolution --

  /**
   * Resolve the active review pass into a ResolvedReviewPass bundle.
   * Returns undefined if none is pinned; throws ConfigMissingError on
   * incomplete config.
   */
  async resolveActiveReviewPass(): Promise<ResolvedReviewPass | undefined> {
    const activeId = await this.getActiveReviewPassId();
    if (!activeId) return undefined;

    const reviewPass = await this.getReviewPass(activeId);
    if (!reviewPass) throw new ConfigMissingError(`review pass "${activeId}"`);

    const pool = await this.getModelPool(reviewPass.modelPoolId);
    if (!pool) {
      throw new ConfigMissingError(`model pool "${reviewPass.modelPoolId}"`);
    }
    if (pool.models.length === 0) {
      throw new ConfigMissingError(`model pool "${pool.id}" has no models`);
    }

    const systemPromptEntry = await this.getPrompt(reviewPass.systemPromptKey);
    if (!systemPromptEntry) {
      throw new ConfigMissingError(`prompt "${reviewPass.systemPromptKey}"`);
    }
    const vars = reviewPass.variables ?? {};
    const systemPrompt = renderPrompt(systemPromptEntry.body, vars);

    let instructions = "";
    if (reviewPass.instructionsPromptKey) {
      const instrEntry = await this.getPrompt(reviewPass.instructionsPromptKey);
      if (!instrEntry) {
        throw new ConfigMissingError(
          `prompt "${reviewPass.instructionsPromptKey}"`,
        );
      }
      instructions = renderPrompt(instrEntry.body, vars);
    } else if (reviewPass.instructions) {
      instructions = renderPrompt(reviewPass.instructions, vars);
    }

    const directiveEntry = await this.getPrompt(reviewPass.directivePromptKey);
    if (!directiveEntry) {
      throw new ConfigMissingError(`prompt "${reviewPass.directivePromptKey}"`);
    }
    const directive = renderPrompt(directiveEntry.body, vars);

    const catEntries = await this.#adapter.getMany<Category>(
      reviewPass.allowedCategoryIds.map((id) => [CFG, CATEGORIES, id]),
    );
    const categories = catEntries
      .filter(
        (e): e is { value: Category; versionstamp: string; key: Key } =>
          e !== undefined,
      )
      .map((e) => e.value);
    const allowedLabels = categories.map((c) => c.label);

    return {
      reviewPass,
      modelRefs: pool.models,
      apiKeyEnvKey: pool.apiKeyEnvKey ?? DEFAULT_API_KEY_ENV,
      systemPrompt,
      directive,
      instructions,
      categories,
      allowedLabels,
    };
  }
}
