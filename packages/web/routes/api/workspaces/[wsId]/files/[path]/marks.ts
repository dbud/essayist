import { define } from "@/define.ts";
import { marksLoader } from "@/signals/marks.server.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const path = decodeURIComponent(ctx.params.path);
    return Response.json(
      await marksLoader({ workspaceId: ctx.params.wsId, path }),
    );
  }),
};
