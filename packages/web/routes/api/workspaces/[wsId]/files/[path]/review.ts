import { runReviewPass } from "@essayist/core";
import { define } from "@/define.ts";
import { reviewStore, traceStore } from "@/store.ts";
import { ResolveAgentError, resolveAgent } from "@/utils/agent.ts";
import { sseResponse } from "@/utils/sse.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const path = decodeURIComponent(ctx.params.path);
    if (!path.trim()) {
      return Response.json({ error: "Missing 'path'" }, { status: 400 });
    }

    const { config, vfs, wsId } = ctx.state;
    // Promote the pending draft first: the review reads the latest
    // checkpoint, so it covers the current content.
    await vfs.promoteDraft(path);
    try {
      const { agent, pass } = await resolveAgent(config);
      return sseResponse(async (send) => {
        try {
          const run = await runReviewPass({
            agent,
            vfs,
            reviewStore,
            traceStore,
            pass,
            wsId,
            path,
            onProgress: (progress) => send("progress", progress),
          });
          send("done", run);
        } catch (e) {
          send("error", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    } catch (e) {
      if (e instanceof ResolveAgentError) {
        return Response.json({ error: e.message }, { status: 500 });
      }
      throw e;
    }
  }),
};
