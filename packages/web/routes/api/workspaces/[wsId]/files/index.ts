import { define } from "@/define.ts";
import { fileTreeLoader } from "@/signals/fileTree.server.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    return Response.json(
      await fileTreeLoader(ctx.state.workspaceId, {
        user: ctx.state.user,
        url: ctx.url,
      }),
    );
  }),
};
