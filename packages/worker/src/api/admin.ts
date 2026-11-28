// The admin api: config entities for the control panel. Every endpoint requires the admin role,
// enforced by the admin session middleware.
import { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { Schema, Struct } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { AdminConfigData } from "#/models/admin.data.ts";
import { CleanupData } from "#/models/reviewRuns.data.ts";

import { ApiBadRequest, ApiConflict } from "./errors";
import { AdminMiddleware } from "./sessionMiddleware";

// create and update payloads are the entities without their id, which the server sets
const CategoryInput = Schema.Struct(Struct.omit(Category.json.fields, ["id"]));
const ModelPoolInput = Schema.Struct(Struct.omit(ModelPool.json.fields, ["id"]));
const ReviewPassInput = Schema.Struct(Struct.omit(ReviewPass.json.fields, ["id"]));

const IdParam = { id: Schema.NonEmptyString };
const KeyParam = { key: Schema.NonEmptyString };

const Ok = Schema.Struct({ ok: Schema.Literal(true) });

const created = <S extends Schema.Top>(schema: S) => HttpApiSchema.status(201)(schema);

const getAdminConfig = HttpApiEndpoint.get("getAdminConfig", "/admin/config", {
  success: AdminConfigData,
});

const createCategory = HttpApiEndpoint.post("createCategory", "/admin/categories", {
  payload: CategoryInput,
  success: created(Category.json),
});

const updateCategory = HttpApiEndpoint.put("updateCategory", "/admin/categories/:id", {
  params: IdParam,
  payload: CategoryInput,
  success: Category.json,
});

const deleteCategory = HttpApiEndpoint.delete("deleteCategory", "/admin/categories/:id", {
  params: IdParam,
  success: Ok,
});

const createModelPool = HttpApiEndpoint.post("createModelPool", "/admin/model-pools", {
  payload: ModelPoolInput,
  success: created(ModelPool.json),
});

const updateModelPool = HttpApiEndpoint.put("updateModelPool", "/admin/model-pools/:id", {
  params: IdParam,
  payload: ModelPoolInput,
  success: ModelPool.json,
});

const deleteModelPool = HttpApiEndpoint.delete("deleteModelPool", "/admin/model-pools/:id", {
  params: IdParam,
  success: Ok,
});

const createPrompt = HttpApiEndpoint.post("createPrompt", "/admin/prompts", {
  payload: Prompt.json,
  success: created(Prompt.json),
});

const updatePrompt = HttpApiEndpoint.put("updatePrompt", "/admin/prompts/:key", {
  params: KeyParam,
  payload: Prompt.json,
  success: Prompt.json,
});

const deletePrompt = HttpApiEndpoint.delete("deletePrompt", "/admin/prompts/:key", {
  params: KeyParam,
  success: Ok,
});

const createReviewPass = HttpApiEndpoint.post("createReviewPass", "/admin/review-passes", {
  payload: ReviewPassInput,
  success: created(ReviewPass.json),
});

const updateReviewPass = HttpApiEndpoint.put("updateReviewPass", "/admin/review-passes/:id", {
  params: IdParam,
  payload: ReviewPassInput,
  success: ReviewPass.json,
});

const deleteReviewPass = HttpApiEndpoint.delete("deleteReviewPass", "/admin/review-passes/:id", {
  params: IdParam,
  success: Ok,
});

const ActiveReviewPassPayload = Schema.Struct({ reviewPassId: Schema.NonEmptyString });
const ActiveReviewPassData = Schema.Struct({ activeReviewPassId: Schema.String });

const setActiveReviewPass = HttpApiEndpoint.put(
  "setActiveReviewPass",
  "/admin/active-review-pass",
  {
    payload: ActiveReviewPassPayload,
    success: ActiveReviewPassData,
    error: HttpApiError.NotFound,
  },
);

const GraphNode = Schema.Struct({ id: Schema.String, kind: Schema.String });
const GraphEdge = Schema.Struct({ from: Schema.String, to: Schema.String });
const PassGraphData = Schema.Struct({
  name: Schema.String,
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(GraphEdge),
  definition: Schema.String,
});

const getPassGraph = HttpApiEndpoint.get("getPassGraph", "/admin/review-passes/:id/graph", {
  params: IdParam,
  success: PassGraphData,
  error: [HttpApiError.NotFound, ApiBadRequest],
});

const deleteReviewRun = HttpApiEndpoint.delete("deleteReviewRun", "/admin/review-runs/:id", {
  params: IdParam,
  query: Schema.Struct({ wsId: Schema.NonEmptyString }),
  success: CleanupData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound, ApiConflict],
});

// Without versionId, clears the whole file.
const clearReviewRuns = HttpApiEndpoint.delete("clearReviewRuns", "/admin/review-runs", {
  query: Schema.Struct({
    wsId: Schema.NonEmptyString,
    path: Schema.NonEmptyString,
    versionId: Schema.optional(Schema.NonEmptyString),
  }),
  success: CleanupData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound, ApiConflict],
});

export const adminGroup = HttpApiGroup.make("admin")
  .add(getAdminConfig)
  .add(createCategory)
  .add(updateCategory)
  .add(deleteCategory)
  .add(createModelPool)
  .add(updateModelPool)
  .add(deleteModelPool)
  .add(createPrompt)
  .add(updatePrompt)
  .add(deletePrompt)
  .add(createReviewPass)
  .add(updateReviewPass)
  .add(deleteReviewPass)
  .add(setActiveReviewPass)
  .add(getPassGraph)
  .add(deleteReviewRun)
  .add(clearReviewRuns)
  .middleware(AdminMiddleware);
