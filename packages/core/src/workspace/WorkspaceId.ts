/**
 * The workspace scope for workspace-relative file operations: resolved per
 * request by the composition root (web middleware scopes it after access
 * checks) and fixed in tests.
 */

import { Context } from "effect";

export class WorkspaceId extends Context.Service<
  WorkspaceId,
  { wsId: string }
>()("@essayist/core/workspace/WorkspaceId") {}
