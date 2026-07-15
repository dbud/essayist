import { VirtualFileSystem } from "@essayist/core";
import { define } from "@/define.ts";
import { adapter, store } from "@/store.ts";

/**
 * Resolve the workspace from the route's `:wsId` param, enforce access, and
 * construct a per-request VFS scoped to that workspace on `ctx.state`.
 *
 * Runs for every route under `routes/api/workspaces/[wsId]/`. The global
 * `authMiddleware` has already set `ctx.state.user`.
 */
export default define.middleware(async (ctx) => {
  const wsId = ctx.params.wsId;
  const hasAccess = await store.hasAccess(wsId, ctx.state.user.id);
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  ctx.state.workspaceId = wsId;
  ctx.state.vfs = new VirtualFileSystem(adapter, wsId);
  return ctx.next();
});
