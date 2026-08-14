import { define } from "@/define.ts";
import { reviewStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { workspaceId } = ctx.state;
    const file = ctx.url.searchParams.get("file");
    const fileId = file?.trim() ? file : undefined;
    const runs = await reviewStore.listRuns({ workspaceId, fileId });
    return Response.json(runs);
  }),
};
