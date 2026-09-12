import { define } from "@/define.ts";
import { fileTreeLoader } from "@/signals/fileTree.server.ts";
import { userStateStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    return Response.json(
      await fileTreeLoader(ctx.state.workspaceId, {
        user: ctx.state.user,
        url: ctx.url,
      }),
    );
  }),

  PATCH: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      selectedPath?: string;
    } | null;
    const selectedPath = body?.selectedPath?.trim();
    if (!selectedPath) {
      return Response.json(
        { error: "Missing 'selectedPath'" },
        { status: 400 },
      );
    }
    await userStateStore.setSelectedFile(
      ctx.state.user.id,
      ctx.state.workspaceId,
      selectedPath,
    );
    return new Response(null, { status: 204 });
  }),
};
