// Config families and sync logic for the kvctl sync command.

import {
  CategorySchema,
  type ConfigStore,
  type ModelPool,
  ModelPoolSchema,
  PromptSchema,
  ReviewPassSchema,
} from "@essayist/core";
import { mapNotNullish } from "@std/collections";

export type FamilyKey = "pools" | "prompts" | "categories" | "passes";
export const FAMILY_ORDER: FamilyKey[] = [
  "pools",
  "prompts",
  "categories",
  "passes",
];

export interface SyncCtx {
  source: ConfigStore;
  target: ConfigStore;
  /** Target KV handle, for cache epoch bumps. */
  kv: Deno.Kv;
}

/** Validate one entity against a zod schema; returns an error message or
 *  null. Structural so kvctl does not need a zod dependency of its own. */
function check<T>(
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { message: string; path: PropertyKey[] }[] };
        };
  },
  label: string,
): (value: unknown) => string | null {
  return (value) => {
    const result = schema.safeParse(value);
    if (result.success) return null;
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return `${label}: ${detail}`;
  };
}

interface CopyArgs<T> {
  name: string;
  source: T[];
  target: T[];
  keyOf: (entity: T) => string;
  check: (entity: T) => string | null;
  save: (entity: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
  prune: boolean;
  /** Return a reason to keep a target-only id instead of pruning it. */
  keep?: (id: string) => string | null;
}

/** Upsert source entries into the target by key, skipping byte-identical
 *  entries. Prune deletes target entries missing from the source, except
 *  those `keep` protects. */
async function copyEntries<T>({
  name,
  source,
  target,
  keyOf,
  check: validate,
  save,
  remove,
  prune,
  keep,
}: CopyArgs<T>): Promise<{ line: string; changed: boolean }> {
  const issues = mapNotNullish(source, validate);
  if (issues.length > 0) {
    throw new Error(`invalid ${name} in source:\n  ${issues.join("\n  ")}`);
  }
  const targetJson = new Map(
    target.map((entity) => [keyOf(entity), JSON.stringify(entity)] as const),
  );
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const entity of source) {
    const id = keyOf(entity);
    const json = JSON.stringify(entity);
    const prev = targetJson.get(id);
    if (prev === json) {
      unchanged++;
      continue;
    }
    await save(entity);
    if (prev === undefined) added++;
    else updated++;
  }
  let pruned = 0;
  const kept: string[] = [];
  if (prune) {
    const sourceIds = new Set(source.map(keyOf));
    for (const [id] of targetJson) {
      if (sourceIds.has(id)) continue;
      const reason = keep?.(id);
      if (reason) {
        kept.push(`${id} (${reason})`);
        continue;
      }
      await remove(id);
      pruned++;
    }
  }
  const parts = [
    `${name}: ${source.length} in source, ${added} added, ${updated} updated, ${unchanged} unchanged`,
  ];
  if (pruned > 0) parts.push(`pruned ${pruned}`);
  if (kept.length > 0) parts.push(`kept ${kept.join(", ")}`);
  return { line: parts.join("; "), changed: added + updated + pruned > 0 };
}

export const FAMILIES: Record<
  FamilyKey,
  (ctx: SyncCtx, prune: boolean) => Promise<{ line: string; changed: boolean }>
> = {
  async pools(ctx, prune) {
    return copyEntries({
      name: "model pools",
      source: await ctx.source.listModelPools(),
      target: await ctx.target.listModelPools(),
      keyOf: (e) => e.id,
      check: check(ModelPoolSchema, "model pool"),
      save: (e: ModelPool) => ctx.target.saveModelPool(e),
      remove: (id) => ctx.target.deleteModelPool(id),
      prune,
    });
  },
  async prompts(ctx, prune) {
    return copyEntries({
      name: "prompts",
      source: await ctx.source.listPrompts(),
      target: await ctx.target.listPrompts(),
      keyOf: (e) => e.key,
      check: check(PromptSchema, "prompt"),
      save: (e) => ctx.target.savePrompt(e),
      remove: (id) => ctx.target.deletePrompt(id),
      prune,
    });
  },
  async categories(ctx, prune) {
    return copyEntries({
      name: "categories",
      source: await ctx.source.listCategories(),
      target: await ctx.target.listCategories(),
      keyOf: (e) => e.id,
      check: check(CategorySchema, "category"),
      save: (e) => ctx.target.saveCategory(e),
      remove: (id) => ctx.target.deleteCategory(id),
      prune,
    });
  },
  async passes(ctx, prune) {
    // Keep the pass currently active on the target even when pruning.
    const activeId = await ctx.target.getActiveReviewPassId();
    return copyEntries({
      name: "review passes",
      source: await ctx.source.listReviewPasses(),
      target: await ctx.target.listReviewPasses(),
      keyOf: (e) => e.id,
      check: check(ReviewPassSchema, "review pass"),
      save: (e) => ctx.target.saveReviewPass(e),
      remove: (id) => ctx.target.deleteReviewPass(id),
      prune,
      keep: (id) => (id === activeId ? "active on target" : null),
    });
  },
};

/** Warn about target review passes referencing entities the target lacks. */
export async function warnBrokenRefs(ctx: SyncCtx): Promise<void> {
  const [pools, prompts, categories, passes] = await Promise.all([
    ctx.target.listModelPools(),
    ctx.target.listPrompts(),
    ctx.target.listCategories(),
    ctx.target.listReviewPasses(),
  ]);
  const poolIds = new Set(pools.map((p) => p.id));
  const promptKeys = new Set(prompts.map((p) => p.key));
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const pass of passes) {
    const missing: string[] = [];
    if (!poolIds.has(pass.modelPoolId)) {
      missing.push(`model pool "${pass.modelPoolId}"`);
    }
    for (const key of [
      pass.systemPromptKey,
      pass.directivePromptKey,
      ...(pass.instructionsPromptKey ? [pass.instructionsPromptKey] : []),
    ]) {
      if (!promptKeys.has(key)) missing.push(`prompt "${key}"`);
    }
    for (const id of pass.allowedCategoryIds) {
      if (!categoryIds.has(id)) missing.push(`category "${id}"`);
    }
    if (missing.length > 0) {
      console.error(
        `warning: review pass "${pass.id}" references missing ${missing.join(", ")}`,
      );
    }
  }
}
