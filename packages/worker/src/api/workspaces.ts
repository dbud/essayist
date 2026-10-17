import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api";
import { FileTreeData } from "#/models/fileTree.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";
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

const selectWorkspace = HttpApiEndpoint.patch(
  "selectWorkspace",
  "/workspaces",
  {
    payload: SelectPayload,
    error: HttpApiError.Forbidden,
  },
);

const getFiles = HttpApiEndpoint.get("getFiles", "/workspaces/files", {
  query: FilesQuery,
  success: FileTreeData,
  error: HttpApiError.Forbidden,
});

const selectFile = HttpApiEndpoint.patch("selectFile", "/workspaces/files", {
  payload: SelectFilePayload,
  error: HttpApiError.Forbidden,
});

export const workspaceGroup = HttpApiGroup.make("workspaces")
  .add(getWorkspaces)
  .add(selectWorkspace)
  .add(getFiles)
  .add(selectFile)
  .middleware(SessionMiddleware);
