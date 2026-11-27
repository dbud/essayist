import { Context, type Effect, type Option } from "effect";

import type { Category, ConfigMissingError, ModelPool, Prompt, ReviewPass } from "./types.ts";

export interface Interface {
  // model pools
  getModelPool(id: string): Effect.Effect<ModelPool, ConfigMissingError>;
  saveModelPool(pool: ModelPool): Effect.Effect<void>;
  deleteModelPool(id: string): Effect.Effect<void>;
  listModelPools(): Effect.Effect<ReadonlyArray<ModelPool>>;

  // prompts
  getPrompt(key: string): Effect.Effect<Prompt, ConfigMissingError>;
  savePrompt(prompt: Prompt): Effect.Effect<void>;
  deletePrompt(key: string): Effect.Effect<void>;
  listPrompts(): Effect.Effect<ReadonlyArray<Prompt>>;

  // categories (mark labels)
  getCategory(id: string): Effect.Effect<Category, ConfigMissingError>;
  saveCategory(category: Category): Effect.Effect<void>;
  /** Marks in a deleted category become uncategorised. */
  deleteCategory(id: string): Effect.Effect<void>;
  listCategories(): Effect.Effect<ReadonlyArray<Category>>;
  /** The categories with these ids, in the order given; the error names every missing id. */
  getCategories(ids: readonly string[]): Effect.Effect<ReadonlyArray<Category>, ConfigMissingError>;

  // review passes
  getReviewPass(id: string): Effect.Effect<ReviewPass, ConfigMissingError>;
  /** Saving the active pass keeps it active. */
  saveReviewPass(pass: ReviewPass): Effect.Effect<void>;
  deleteReviewPass(id: string): Effect.Effect<void>;
  listReviewPasses(): Effect.Effect<ReadonlyArray<ReviewPass>>;

  // the active review pass
  getActiveReviewPassId(): Effect.Effect<Option.Option<string>>;
  /** Make a pass the active one; false when there is no such pass. */
  setActiveReviewPass(reviewPassId: string): Effect.Effect<boolean>;
  clearActiveReviewPass(): Effect.Effect<void>;
}

export class ReviewConfig extends Context.Service<ReviewConfig, Interface>()(
  "@essayist/core/config/ReviewConfig",
) {}
