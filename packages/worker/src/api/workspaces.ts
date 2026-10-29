import { DraftSnapshot, FileVersion } from "@essayist/core";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api";

import { FileContentData } from "#/models/fileContent.data.ts";
import { FileTreeData } from "#/models/fileTree.data.ts";
import { FileVersionsData } from "#/models/fileVersions.data.ts";
import { MarksData } from "#/models/marks.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";

import { ApiFailure } from "./errors";
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

const VersionsQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
});

const DraftPayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  content: Schema.String,
});

const getFileContent = HttpApiEndpoint.get("getFileContent", "/workspaces/files/content", {
  query: ContentQuery,
  success: FileContentData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const saveFileDraft = HttpApiEndpoint.put("saveFileDraft", "/workspaces/files/draft", {
  payload: DraftPayload,
  success: DraftSnapshot,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const PromotePayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
});

const promoteFileDraft = HttpApiEndpoint.post("promoteFileDraft", "/workspaces/files/promote", {
  payload: PromotePayload,
  success: FileVersion,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const getFileVersions = HttpApiEndpoint.get("getFileVersions", "/workspaces/files/versions", {
  query: VersionsQuery,
  success: FileVersionsData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const MarksQuery = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  versionId: Schema.NonEmptyString,
});

const GetMarks = HttpApiEndpoint.get("getMarks", "/workspaces/files/marks", {
  query: MarksQuery,
  success: MarksData,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
});

const UpsertResult = Schema.Struct({
  version_id: Schema.String,
  timestamp: Schema.Number,
  lines: Schema.Number,
  path: Schema.String,
  created: Schema.Boolean,
});

const UpsertPayload = Schema.Struct({
  wsId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  content: Schema.String,
});

const upsertFile = HttpApiEndpoint.put("upsertFile", "/workspaces/files/upsert", {
  payload: UpsertPayload,
  success: UpsertResult,
  error: [HttpApiError.Forbidden, HttpApiError.NotFound],
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
  error: [HttpApiError.Forbidden, HttpApiError.Unauthorized, ApiFailure],
});

export const workspaceGroup = HttpApiGroup.make("workspaces")
  .add(getWorkspaces)
  .add(selectWorkspace)
  .add(getFiles)
  .add(selectFile)
  .add(getFileContent)
  .add(getFileVersions)
  .add(GetMarks)
  .add(saveFileDraft)
  .add(promoteFileDraft)
  .add(upsertFile)
  .add(importGoogleDoc)
  .middleware(SessionMiddleware);
