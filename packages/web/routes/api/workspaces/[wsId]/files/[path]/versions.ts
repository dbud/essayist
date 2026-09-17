import { define } from "@/define.ts";
import { versionHistoryLoader } from "@/signals/versionHistory.server.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const path = decodeURIComponent(ctx.params.path);
    return Response.json(
      await versionHistoryLoader({ wsId: ctx.state.wsId, path }),
    );
  }),
};
