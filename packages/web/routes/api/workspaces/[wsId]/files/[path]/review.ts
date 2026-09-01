import { runReviewPass } from "@essayist/core";
import { define } from "@/define.ts";
import { reviewStore, traceStore } from "@/store.ts";
import { ResolveAgentError, resolveAgent } from "@/utils/agent.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const fileId = decodeURIComponent(ctx.params.path);
    if (!fileId.trim()) {
      return Response.json({ error: "Missing 'path'" }, { status: 400 });
    }

    const { config, vfs, workspaceId } = ctx.state;
    try {
      const { agent, pass } = await resolveAgent(config);
      const run = await runReviewPass({
        agent,
        vfs,
        reviewStore,
        traceStore,
        pass,
        workspaceId,
        fileId,
      });
      return Response.json(run);
    } catch (e) {
      if (e instanceof ResolveAgentError) {
        return Response.json({ error: e.message }, { status: 500 });
      }
      throw e;
    }
  }),
};
