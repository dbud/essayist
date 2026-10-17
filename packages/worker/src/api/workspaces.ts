import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/http-api";
import { WorkspacesData } from "#/models/workspaces.data.ts";
import { SessionMiddleware } from "./sessionMiddleware";

const ListQuery = Schema.Struct({ ws: Schema.optional(Schema.String) });
const SelectPayload = Schema.Struct({ selectedId: Schema.String });

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

export const workspaceGroup = HttpApiGroup.make("workspaces")
  .add(getWorkspaces)
  .add(selectWorkspace)
  .middleware(SessionMiddleware);
