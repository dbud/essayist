import type * as D1Client from "@effect/sql-d1/D1Client";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { ReviewConfig } from "./service.ts";
import { Category, ConfigMissingError, ModelPool, Prompt, ReviewPass } from "./types.ts";

export function layerReviewConfigD1(client: D1Client.D1Client): Layer.Layer<ReviewConfig> {
  const findModelPool = SqlSchema.findOne({
    Request: Schema.Struct({ id: Schema.String }),
    Result: ModelPool,
    execute: ({ id }) => client`SELECT * FROM model_pools WHERE id = ${id}`,
  });
  const findModelPools = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ModelPool,
    execute: () => client`SELECT * FROM model_pools ORDER BY id`,
  });
  const upsertModelPool = SqlSchema.void({
    Request: ModelPool.insert,
    execute: (pool) =>
      client`INSERT INTO model_pools ${client.insert([pool])}
        ON CONFLICT (id) DO UPDATE SET name = excluded.name, models = excluded.models`,
  });

  const findPrompt = SqlSchema.findOne({
    Request: Schema.Struct({ key: Schema.String }),
    Result: Prompt,
    execute: ({ key }) => client`SELECT * FROM prompts WHERE key = ${key}`,
  });
  const findPrompts = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Prompt,
    execute: () => client`SELECT * FROM prompts ORDER BY key`,
  });
  const upsertPrompt = SqlSchema.void({
    Request: Prompt.insert,
    execute: (prompt) =>
      client`INSERT INTO prompts ${client.insert([prompt])}
        ON CONFLICT (key) DO UPDATE SET body = excluded.body`,
  });

  const findCategory = SqlSchema.findOne({
    Request: Schema.Struct({ id: Schema.String }),
    Result: Category,
    execute: ({ id }) => client`SELECT * FROM categories WHERE id = ${id}`,
  });
  const findCategories = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Category,
    execute: () => client`SELECT * FROM categories ORDER BY id`,
  });
  const findCategoriesIn = SqlSchema.findAll({
    Request: Schema.Struct({ ids: Schema.Array(Schema.String) }),
    Result: Category,
    execute: ({ ids }) => client`SELECT * FROM categories WHERE ${client.in("id", ids)}`,
  });
  const upsertCategory = SqlSchema.void({
    Request: Category.insert,
    execute: (category) =>
      client`INSERT INTO categories ${client.insert([category])}
        ON CONFLICT (id) DO UPDATE SET label = excluded.label,
          description = excluded.description, severity = excluded.severity,
          color = excluded.color`,
  });

  const findReviewPass = SqlSchema.findOne({
    Request: Schema.Struct({ id: Schema.String }),
    Result: ReviewPass,
    execute: ({ id }) => client`SELECT * FROM review_passes WHERE id = ${id}`,
  });
  const findReviewPasses = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ReviewPass,
    execute: () => client`SELECT * FROM review_passes ORDER BY id`,
  });
  // leaves the active flag as it is
  const upsertReviewPass = SqlSchema.void({
    Request: ReviewPass.insert,
    execute: (pass) =>
      client`INSERT INTO review_passes ${client.insert([pass])}
        ON CONFLICT (id) DO UPDATE SET name = excluded.name,
          systemPromptKey = excluded.systemPromptKey, modelPoolId = excluded.modelPoolId,
          units = excluded.units, variables = excluded.variables`,
  });
  const findActiveReviewPass = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: Schema.Struct({ id: Schema.String }),
    execute: () => client`SELECT id FROM review_passes WHERE active = 1`,
  });

  const missing = (what: string) => Effect.fail(new ConfigMissingError({ what }));

  const getModelPool = (id: string) =>
    Effect.catchTags(
      findModelPool({ id }),
      { NoSuchElementError: () => missing(`model pool "${id}"`) },
      Effect.die,
    );
  const saveModelPool = (pool: ModelPool) => Effect.orDie(upsertModelPool(pool));
  const deleteModelPool = (id: string) =>
    Effect.asVoid(Effect.orDie(client`DELETE FROM model_pools WHERE id = ${id}`));
  const listModelPools = () => Effect.orDie(findModelPools(undefined));

  const getPrompt = (key: string) =>
    Effect.catchTags(
      findPrompt({ key }),
      { NoSuchElementError: () => missing(`prompt "${key}"`) },
      Effect.die,
    );
  const savePrompt = (prompt: Prompt) => Effect.orDie(upsertPrompt(prompt));
  const deletePrompt = (key: string) =>
    Effect.asVoid(Effect.orDie(client`DELETE FROM prompts WHERE key = ${key}`));
  const listPrompts = () => Effect.orDie(findPrompts(undefined));

  const getCategory = (id: string) =>
    Effect.catchTags(
      findCategory({ id }),
      { NoSuchElementError: () => missing(`category "${id}"`) },
      Effect.die,
    );
  const getCategories = (ids: readonly string[]) =>
    Effect.gen(function* () {
      if (ids.length === 0) return [];
      const found = yield* Effect.orDie(findCategoriesIn({ ids }));
      const byId = new Map(found.map((category) => [category.id, category]));
      const absent = ids.filter((id) => !byId.has(id));
      if (absent.length > 0) {
        return yield* missing(`categories ${absent.map((id) => `"${id}"`).join(", ")}`);
      }
      return ids.flatMap((id) => byId.get(id) ?? []);
    });
  const saveCategory = (category: Category) => Effect.orDie(upsertCategory(category));
  const deleteCategory = (id: string) =>
    Effect.asVoid(Effect.orDie(client`DELETE FROM categories WHERE id = ${id}`));
  const listCategories = () => Effect.orDie(findCategories(undefined));

  const getReviewPass = (id: string) =>
    Effect.catchTags(
      findReviewPass({ id }),
      { NoSuchElementError: () => missing(`review pass "${id}"`) },
      Effect.die,
    );
  const saveReviewPass = (pass: ReviewPass) => Effect.orDie(upsertReviewPass(pass));
  const deleteReviewPass = (id: string) =>
    Effect.asVoid(Effect.orDie(client`DELETE FROM review_passes WHERE id = ${id}`));
  const listReviewPasses = () => Effect.orDie(findReviewPasses(undefined));

  const getActiveReviewPassId = () =>
    Effect.map(
      Effect.orDie(findActiveReviewPass(undefined)),
      Option.map(({ id }) => id),
    );

  // a single batch, so a reader never sees two active passes, or none while switching
  const setActiveReviewPass = (reviewPassId: string) =>
    Effect.gen(function* () {
      const [, activated] = yield* Effect.orDie(
        client.batch([
          client`UPDATE review_passes SET active = 0 WHERE active = 1 AND id <> ${reviewPassId}
            AND EXISTS (SELECT 1 FROM review_passes WHERE id = ${reviewPassId})`,
          client`UPDATE review_passes SET active = 1 WHERE id = ${reviewPassId} RETURNING id`,
        ]),
      );
      return activated.length > 0;
    });

  const clearActiveReviewPass = () =>
    Effect.asVoid(Effect.orDie(client`UPDATE review_passes SET active = 0 WHERE active = 1`));

  return Layer.succeed(
    ReviewConfig,
    ReviewConfig.of({
      getModelPool,
      saveModelPool,
      deleteModelPool,
      listModelPools,
      getPrompt,
      savePrompt,
      deletePrompt,
      listPrompts,
      getCategory,
      getCategories,
      saveCategory,
      deleteCategory,
      listCategories,
      getReviewPass,
      saveReviewPass,
      deleteReviewPass,
      listReviewPasses,
      getActiveReviewPassId,
      setActiveReviewPass,
      clearActiveReviewPass,
    }),
  );
}
