import type * as D1Client from "@effect/sql-d1/D1Client";
import { Layer } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import { layerAuthD1 } from "#/auth/auth_d1.ts";
import type { AuthStore } from "#/auth/service.ts";
import { layerReviewConfigD1 } from "#/config/config_d1.ts";
import type { ReviewConfig } from "#/config/service.ts";
import { layerFilesD1 } from "#/files/files_d1.ts";
import type { Files } from "#/files/service.ts";
import { layerMarksD1 } from "#/marks/marks_d1.ts";
import type { Marks } from "#/marks/service.ts";
import { layerReviewRunsD1 } from "#/reviews/runs_d1.ts";
import type { ReviewRuns } from "#/reviews/service.ts";
import type { TraceEvents } from "#/reviews/trace/service.ts";
import { layerTraceEventsD1 } from "#/reviews/trace/trace_d1.ts";
import type { UserState } from "#/user_state/service.ts";
import { layerUserStateD1 } from "#/user_state/user_state_d1.ts";
import type { Workspaces } from "#/workspace/service.ts";
import { layerWorkspacesD1 } from "#/workspace/workspaces_d1.ts";

export type CoreServices =
  | AuthStore
  | Files
  | Marks
  | ReviewConfig
  | ReviewRuns
  | TraceEvents
  | UserState
  | Workspaces;

/** Every core service over a single D1 database. */
export function layerCoreD1(client: D1Client.D1Client & SqlClient): Layer.Layer<CoreServices> {
  const files = layerFilesD1(client);
  return Layer.mergeAll(
    layerAuthD1(client),
    files,
    Layer.provide(layerMarksD1(client), files),
    layerReviewConfigD1(client),
    layerReviewRunsD1(client),
    layerTraceEventsD1(client),
    layerUserStateD1(client),
    layerWorkspacesD1(client),
  );
}
