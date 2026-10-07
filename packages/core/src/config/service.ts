/**
 * The review configuration as an Effect service: model pools, prompts,
 * categories, review passes, and the active-pass pin, in storage.
 */

import { Context, Effect, Layer } from "effect";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
} from "@/persistence/mod.ts";
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

export interface Interface {
  // model pools
  getModelPool(
    id: string,
  ): Effect.Effect<ModelPool | undefined, PersistenceError>;
  saveModelPool(
    p: ModelPool,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  deleteModelPool(
    id: string,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  listModelPools(): Effect.Effect<ModelPool[], PersistenceError>;

  // prompts
  getPrompt(key: string): Effect.Effect<Prompt | undefined, PersistenceError>;
  savePrompt(
    p: Prompt,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  deletePrompt(
    key: string,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  listPrompts(): Effect.Effect<Prompt[], PersistenceError>;

  // categories (mark labels)
  getCategory(
    id: string,
  ): Effect.Effect<Category | undefined, PersistenceError>;
  saveCategory(
    c: Category,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  deleteCategory(
    id: string,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  listCategories(): Effect.Effect<Category[], PersistenceError>;
  /** The requested ids split into found categories and missing ids. */
  getCategories(
    ids: string[],
  ): Effect.Effect<[Category[], string[]], PersistenceError>;

  // review passes
  getReviewPass(
    id: string,
  ): Effect.Effect<ReviewPass | undefined, PersistenceError>;
  saveReviewPass(
    r: ReviewPass,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  deleteReviewPass(
    id: string,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  listReviewPasses(): Effect.Effect<ReviewPass[], PersistenceError>;

  // active review-pass pin
  getActiveReviewPassId(): Effect.Effect<string | undefined, PersistenceError>;
  /** Pin the active review pass. */
  setActiveReviewPass(
    reviewPassId: string,
  ): Effect.Effect<void, PersistenceError | ConcurrentModificationError>;
  clearActiveReviewPass(): Effect.Effect<
    void,
    PersistenceError | ConcurrentModificationError
  >;
}

export class ReviewConfig extends Context.Service<ReviewConfig, Interface>()(
  "@essayist/core/config/ReviewConfig",
) {
  /** Requires the {@linkcode Persistence} service; compose with
   * Persistence.layerKv at the composition root. */
  static readonly layerNoDeps: Layer.Layer<ReviewConfig, never, Persistence> =
    Layer.effect(
      ReviewConfig,
      Effect.gen(function* () {
        const persistence = yield* Persistence;

        const getModelPool = (id: string) =>
          persistence
            .get<ModelPool>([CFG, MODEL_POOLS, id])
            .pipe(Effect.map((entry) => entry?.value));
        const saveModelPool = (p: ModelPool) =>
          persistence.set([CFG, MODEL_POOLS, p.id], p);
        const deleteModelPool = (id: string) =>
          persistence.delete([CFG, MODEL_POOLS, id]);
        const listModelPools = () =>
          persistence
            .list<ModelPool>([CFG, MODEL_POOLS])
            .pipe(
              Effect.map(({ entries }) => entries.map((entry) => entry.value)),
            );

        const getPrompt = (key: string) =>
          persistence
            .get<Prompt>([CFG, PROMPTS, key])
            .pipe(Effect.map((entry) => entry?.value));
        const savePrompt = (p: Prompt) =>
          persistence.set([CFG, PROMPTS, p.key], p);
        const deletePrompt = (key: string) =>
          persistence.delete([CFG, PROMPTS, key]);
        const listPrompts = () =>
          persistence
            .list<Prompt>([CFG, PROMPTS])
            .pipe(
              Effect.map(({ entries }) => entries.map((entry) => entry.value)),
            );

        const getCategory = (id: string) =>
          persistence
            .get<Category>([CFG, CATEGORIES, id])
            .pipe(Effect.map((entry) => entry?.value));
        const saveCategory = (c: Category) =>
          persistence.set([CFG, CATEGORIES, c.id], c);
        const deleteCategory = (id: string) =>
          persistence.delete([CFG, CATEGORIES, id]);
        const listCategories = () =>
          persistence
            .list<Category>([CFG, CATEGORIES])
            .pipe(
              Effect.map(({ entries }) => entries.map((entry) => entry.value)),
            );
        const getCategories = (ids: string[]) =>
          Effect.gen(function* () {
            const entries = yield* persistence.getMany<Category>(
              ids.map((id) => [CFG, CATEGORIES, id]),
            );
            const present: Category[] = [];
            const missing: string[] = [];
            ids.forEach((id, index) => {
              const value = entries[index]?.value;
              if (value === undefined) missing.push(id);
              else present.push(value);
            });
            return [present, missing] as [Category[], string[]];
          });

        const getReviewPass = (id: string) =>
          persistence
            .get<ReviewPass>([CFG, REVIEW_PASSES, id])
            .pipe(Effect.map((entry) => entry?.value));
        const saveReviewPass = (r: ReviewPass) =>
          persistence.set([CFG, REVIEW_PASSES, r.id], r);
        const deleteReviewPass = (id: string) =>
          persistence.delete([CFG, REVIEW_PASSES, id]);
        const listReviewPasses = () =>
          persistence
            .list<ReviewPass>([CFG, REVIEW_PASSES])
            .pipe(
              Effect.map(({ entries }) => entries.map((entry) => entry.value)),
            );

        const getActiveReviewPassId = () =>
          persistence
            .get<ActivePin>([CFG, ACTIVE])
            .pipe(Effect.map((entry) => entry?.value.reviewPassId));
        const setActiveReviewPass = (reviewPassId: string) =>
          persistence.set([CFG, ACTIVE], { reviewPassId } satisfies ActivePin);
        const clearActiveReviewPass = () => persistence.delete([CFG, ACTIVE]);

        return ReviewConfig.of({
          getModelPool,
          saveModelPool,
          deleteModelPool,
          listModelPools,
          getPrompt,
          savePrompt,
          deletePrompt,
          listPrompts,
          getCategory,
          saveCategory,
          deleteCategory,
          listCategories,
          getCategories,
          getReviewPass,
          saveReviewPass,
          deleteReviewPass,
          listReviewPasses,
          getActiveReviewPassId,
          setActiveReviewPass,
          clearActiveReviewPass,
        });
      }),
    );
}
