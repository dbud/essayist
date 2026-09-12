import { define } from "@/define.ts";
import { userStateStore, workspaceStore } from "@/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      workspaceId?: string;
    } | null;
    const workspaceId = body?.workspaceId?.trim();
    if (!workspaceId) {
      return Response.json({ error: "Missing 'workspaceId'" }, { status: 400 });
    }
    if (!(await workspaceStore.hasAccess(workspaceId, ctx.state.user.id))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    await userStateStore.setSelectedWorkspace(ctx.state.user.id, workspaceId);
    return new Response(null, { status: 204 });
  }),
};
