import { FileDraft, FileVersion, ReviewRun, Workspace } from "@essayist/core";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/http-api";

import { FileContentData, FileWriteData } from "#/models/fileContent.data.ts";
import { FileTreeData } from "#/models/fileTree.data.ts";
import { FileVersionsData } from "#/models/fileVersions.data.ts";
import { LatestReviewData } from "#/models/marks.data.ts";
import { ReviewRunsData } from "#/models/reviewRuns.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";

import { ApiConflict, ApiFailure, ApiTooLarge } from "./errors";
import { SessionMiddleware } from "./sessionMiddleware";

const ListQuery = Schema.Struct({ wsId: Schema.optional(Schema.String) });
const SelectPayload = Schema.Struct({ wsId: Schema.NonEmptyString });

const FilesQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.optional(Schema.String),
});
const SelectFilePayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
});

const getWorkspaces = HttpApiEndpoint.get("getWorkspaces", "/workspaces", {
  query: ListQuery,
  success: WorkspacesData,
});

const selectWorkspace = HttpApiEndpoint.patch("selectWorkspace", "/workspaces", {
  payload: SelectPayload,
  error: HttpApiError.Forbidden,
});

const CreatePayload = Schema.Struct({ name: Schema.NonEmptyString });

const createWorkspace = HttpApiEndpoint.post("createWorkspace", "/workspaces", {
  payload: CreatePayload,
  success: Workspace.json,
});

// Soft delete, owner only.
const deleteWorkspace = HttpApiEndpoint.delete("deleteWorkspace", "/workspaces", {
  query: SelectPayload,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const getFiles = HttpApiEndpoint.get("getFiles", "/workspaces/files", {
  query: FilesQuery,
  success: FileTreeData,
  error: HttpApiError.Forbidden,
});

const selectFile = HttpApiEndpoint.patch("selectFile", "/workspaces/files", {
  payload: SelectFilePayload,
  error: HttpApiError.Forbidden,
});

const ContentQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  versionId: Schema.optional(Schema.String),
});

const FileQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
});

const DraftPayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  baseVersionId: Schema.NonEmptyString,
  content: Schema.String,
});

const getFileContent = HttpApiEndpoint.get("getFileContent", "/workspaces/files/content", {
  query: ContentQuery,
  success: FileContentData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const saveFileDraft = HttpApiEndpoint.put("saveFileDraft", "/workspaces/files/draft", {
  payload: DraftPayload,
  success: FileDraft.json,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound, ApiConflict, ApiTooLarge],
});

const PromotePayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
});

const promoteFileDraft = HttpApiEndpoint.post("promoteFileDraft", "/workspaces/files/promote", {
  payload: PromotePayload,
  success: FileVersion.json,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const getFileVersions = HttpApiEndpoint.get("getFileVersions", "/workspaces/files/versions", {
  query: FileQuery,
  success: FileVersionsData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const WritePayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  content: Schema.String,
});

const createFile = HttpApiEndpoint.post("createFile", "/workspaces/files/create", {
  payload: WritePayload,
  success: FileWriteData,
  error: [HttpApiError.Forbidden, ApiConflict, ApiTooLarge],
});

const upsertFile = HttpApiEndpoint.put("upsertFile", "/workspaces/files/upsert", {
  payload: WritePayload,
  success: FileWriteData,
  error: [HttpApiError.Forbidden, ApiTooLarge],
});

const ImportPayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  docId: Schema.NonEmptyString,
  name: Schema.optional(Schema.String),
});

const ImportResult = Schema.Struct({
  path: Schema.String,
  created: Schema.Boolean,
});

const importGoogleDoc = HttpApiEndpoint.post("importGoogleDoc", "/workspaces/import/google-docs", {
  payload: ImportPayload,
  success: ImportResult,
  error: [HttpApiError.Forbidden, HttpApiError.Unauthorized, ApiFailure, ApiTooLarge],
});

const RunsQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.optional(Schema.String),
});

const getReviewRuns = HttpApiEndpoint.get("getReviewRuns", "/workspaces/review-runs", {
  query: RunsQuery,
  success: ReviewRunsData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const StartReviewPayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
});

const accepted = <S extends Schema.Top>(schema: S) => HttpApiSchema.status(202)(schema);

const getLatestReview = HttpApiEndpoint.get("getLatestReview", "/workspaces/files/review", {
  query: ContentQuery,
  success: LatestReviewData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const startReview = HttpApiEndpoint.post("startReview", "/workspaces/files/review", {
  payload: StartReviewPayload,
  success: accepted(ReviewRun.json),
  error: [HttpApiError.Forbidden, HttpApiError.NotFound, ApiFailure, ApiConflict],
});

export const workspaceGroup = HttpApiGroup.make("workspaces")
  .add(getWorkspaces)
  .add(selectWorkspace)
  .add(createWorkspace)
  .add(deleteWorkspace)
  .add(getFiles)
  .add(selectFile)
  .add(getFileContent)
  .add(getFileVersions)
  .add(saveFileDraft)
  .add(promoteFileDraft)
  .add(createFile)
  .add(upsertFile)
  .add(importGoogleDoc)
  .add(getReviewRuns)
  .add(getLatestReview)
  .add(startReview)
  .middleware(SessionMiddleware);
