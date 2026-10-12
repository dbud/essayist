import {
  ConfigInvalidError,
  ConfigMissingError,
  ModelClient,
  runReviewPass,
  WorkspaceId,
} from "@essayist/core";
import { Effect } from "effect";
import { define } from "@/define.ts";
import { runtime } from "@/store.ts";
import { ResolveAgentError, resolveReviewSetup } from "@/utils/agent.ts";
import { sseResponse } from "@/utils/sse.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const path = decodeURIComponent(ctx.params.path);
    if (!path.trim()) {
      return Response.json({ error: "Missing 'path'" }, { status: 400 });
    }

    const { vfs, wsId } = ctx.state;
    // Promote the pending draft first: the review reads the latest
    // checkpoint, so it covers the current content.
    await vfs.promoteDraft(path);
    try {
      const { apiKey, pass } = await resolveReviewSetup(runtime);
      return sseResponse(async (send) => {
        try {
          const run = await runtime.runPromise(
            Effect.provide(
              Effect.provideService(
                runReviewPass({
                  pass,
                  wsId,
                  path,
                  onProgress: (progress) => send("progress", progress),
                }),
                WorkspaceId,
                { wsId },
              ),
              ModelClient.layerOpenRouter(apiKey),
            ),
          );
          send("done", run);
        } catch (e) {
          send("error", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    } catch (e) {
      if (
        e instanceof ResolveAgentError ||
        e instanceof ConfigMissingError ||
        e instanceof ConfigInvalidError
      ) {
        return Response.json({ error: e.message }, { status: 500 });
      }
      throw e;
    }
  }),
};
