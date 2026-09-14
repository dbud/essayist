import { define } from "@/define.ts";
import { reviewLoader } from "@/signals/review.server.ts";
import { reviewStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { workspaceId } = ctx.state;
    const file = ctx.url.searchParams.get("file");
    if (!file?.trim()) {
      return Response.json({
        runs: await reviewStore.listRuns({ workspaceId }),
      });
    }
    return Response.json(await reviewLoader({ workspaceId, path: file }));
  }),
};
