import { define } from "@/define.ts";
import { userStateStore } from "@/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      path?: string;
    } | null;
    const path = body?.path?.trim();
    if (!path) {
      return Response.json({ error: "Missing 'path'" }, { status: 400 });
    }
    await userStateStore.setSelectedFile(
      ctx.state.user.id,
      ctx.state.workspaceId,
      path,
    );
    return new Response(null, { status: 204 });
  }),
};
