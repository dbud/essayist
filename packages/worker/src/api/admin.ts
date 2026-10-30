// The admin api: config entities for the control panel. Every endpoint requires the admin role,
// enforced by the admin session middleware.
import {
  CategorySchema,
  ModelPoolSchema,
  PromptSchema,
  ReviewPassSchema,
  ReviewUnitSchema,
} from "@essayist/core";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { ApiBadRequest } from "./errors";
import { AdminMiddleware } from "./sessionMiddleware";

const AdminConfigData = Schema.Struct({
  modelPools: Schema.Array(ModelPoolSchema),
  prompts: Schema.Array(PromptSchema),
  categories: Schema.Array(CategorySchema),
  reviewPasses: Schema.Array(ReviewPassSchema),
  activeReviewPassId: Schema.optional(Schema.String),
});

// Create and update payloads are the entity schemas without the id; the server derives ids.

const CategoryInput = Schema.Struct({
  label: Schema.String,
  description: Schema.optionalKey(Schema.String),
  severity: Schema.optionalKey(Schema.String),
  color: Schema.optionalKey(Schema.String),
});

const ModelPoolInput = Schema.Struct({
  name: Schema.String,
  models: Schema.Array(Schema.String),
});

const ReviewPassInput = Schema.Struct({
  name: Schema.String,
  systemPromptKey: Schema.String,
  modelPoolId: Schema.String,
  units: Schema.Array(ReviewUnitSchema),
  variables: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

const IdParam = { id: Schema.NonEmptyString };
const KeyParam = { key: Schema.NonEmptyString };

const Ok = Schema.Struct({ ok: Schema.Literal(true) });

const created = <S extends Schema.Top>(schema: S) => HttpApiSchema.status(201)(schema);

const getAdminConfig = HttpApiEndpoint.get("getAdminConfig", "/admin/config", {
  success: AdminConfigData,
});

const createCategory = HttpApiEndpoint.post("createCategory", "/admin/categories", {
  payload: CategoryInput,
  success: created(CategorySchema),
});

const updateCategory = HttpApiEndpoint.put("updateCategory", "/admin/categories/:id", {
  params: IdParam,
  payload: CategoryInput,
  success: CategorySchema,
});

const deleteCategory = HttpApiEndpoint.delete("deleteCategory", "/admin/categories/:id", {
  params: IdParam,
  success: Ok,
});

const createModelPool = HttpApiEndpoint.post("createModelPool", "/admin/model-pools", {
  payload: ModelPoolInput,
  success: created(ModelPoolSchema),
});

const updateModelPool = HttpApiEndpoint.put("updateModelPool", "/admin/model-pools/:id", {
  params: IdParam,
  payload: ModelPoolInput,
  success: ModelPoolSchema,
});

const deleteModelPool = HttpApiEndpoint.delete("deleteModelPool", "/admin/model-pools/:id", {
  params: IdParam,
  success: Ok,
});

const createPrompt = HttpApiEndpoint.post("createPrompt", "/admin/prompts", {
  payload: PromptSchema,
  success: created(PromptSchema),
});

const updatePrompt = HttpApiEndpoint.put("updatePrompt", "/admin/prompts/:key", {
  params: KeyParam,
  payload: PromptSchema,
  success: PromptSchema,
});

const deletePrompt = HttpApiEndpoint.delete("deletePrompt", "/admin/prompts/:key", {
  params: KeyParam,
  success: Ok,
});

const createReviewPass = HttpApiEndpoint.post("createReviewPass", "/admin/review-passes", {
  payload: ReviewPassInput,
  success: created(ReviewPassSchema),
});

const updateReviewPass = HttpApiEndpoint.put("updateReviewPass", "/admin/review-passes/:id", {
  params: IdParam,
  payload: ReviewPassInput,
  success: ReviewPassSchema,
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
  .middleware(AdminMiddleware);
