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

const WorkspaceRef = Schema.Struct({ wsId: Schema.NonEmptyString });

const FileRef = Schema.Struct({
  wsId: Schema.NonEmptyString,
  fileId: Schema.NonEmptyString,
});

const getWorkspaces = HttpApiEndpoint.get("getWorkspaces", "/workspaces", {
  success: WorkspacesData,
});

const selectWorkspace = HttpApiEndpoint.patch("selectWorkspace", "/workspaces", {
  payload: WorkspaceRef,
  error: HttpApiError.Forbidden,
});

const CreatePayload = Schema.Struct({ name: Schema.NonEmptyString });

const createWorkspace = HttpApiEndpoint.post("createWorkspace", "/workspaces", {
  payload: CreatePayload,
  success: Workspace.json,
});

// Soft delete, owner only.
const deleteWorkspace = HttpApiEndpoint.delete("deleteWorkspace", "/workspaces", {
  query: WorkspaceRef,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const getFiles = HttpApiEndpoint.get("getFiles", "/workspaces/files", {
  query: WorkspaceRef,
  success: FileTreeData,
  error: HttpApiError.Forbidden,
});

const selectFile = HttpApiEndpoint.patch("selectFile", "/workspaces/files", {
  payload: FileRef,
  error: HttpApiError.Forbidden,
});

const ContentQuery = Schema.Struct({
  ...FileRef.fields,
  versionId: Schema.optional(Schema.String),
});

const DraftPayload = Schema.Struct({
  ...FileRef.fields,
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

const promoteFileDraft = HttpApiEndpoint.post("promoteFileDraft", "/workspaces/files/promote", {
  payload: FileRef,
  success: FileVersion.json,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const getFileVersions = HttpApiEndpoint.get("getFileVersions", "/workspaces/files/versions", {
  query: FileRef,
  success: FileVersionsData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const WritePayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  content: Schema.String,
});

// the client picks the id of a new file, so it can address the file before it exists
const CreateFilePayload = Schema.Struct({
  ...WritePayload.fields,
  fileId: Schema.String.check(Schema.isUUID()),
});

const createFile = HttpApiEndpoint.post("createFile", "/workspaces/files/create", {
  payload: CreateFilePayload,
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

// the runs of a file, or of the whole workspace without a file
const RunsQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  fileId: Schema.optional(Schema.NonEmptyString),
});

const getReviewRuns = HttpApiEndpoint.get("getReviewRuns", "/workspaces/review-runs", {
  query: RunsQuery,
  success: ReviewRunsData,
  error: HttpApiError.Forbidden,
});

const accepted = <S extends Schema.Top>(schema: S) => HttpApiSchema.status(202)(schema);

const getLatestReview = HttpApiEndpoint.get("getLatestReview", "/workspaces/files/review", {
  query: ContentQuery,
  success: LatestReviewData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const startReview = HttpApiEndpoint.post("startReview", "/workspaces/files/review", {
  payload: FileRef,
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
