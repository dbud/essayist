import { Workspaces } from "@essayist/core";
import { define } from "#/define.ts";
import { runScoped } from "#/run.ts";
import { runtime } from "#/store.ts";

/**
 * Resolve the workspace from the route's `:wsId` param, enforce access, and
 * construct a per-request VFS scoped to that workspace on `ctx.state`.
 *
 * Runs for every route under `routes/api/workspaces/[wsId]/`. The global
 * `authMiddleware` has already set `ctx.state.user`.
 */
export default define.middleware(async (ctx) => {
  const wsId = ctx.params.wsId;
  const hasAccess = await runtime.runPromise(
    Workspaces.use((store) => store.hasAccess(wsId, ctx.state.user.id)),
  );
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  ctx.state.wsId = wsId;
  ctx.state.run = runScoped(runtime, wsId);
  return ctx.next();
});
