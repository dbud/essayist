import { ReviewRuns, Workspaces, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";
import { Hono } from "hono";

import { requireUser, resolveSession } from "#/auth/session.ts";
import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";

export const streamRoutes = new Hono<{ Bindings: Cloudflare.Env }>()
  .use("*", resolveSession)
  .use("*", requireUser)
  .get("/review-runs/:wsId/:runId", async (c) => {
    const user = c.get("auth-user");
    if (user === undefined) return c.redirect("/", 303);
    const { wsId, runId } = c.req.param();
    const e = env(c.env);
    const rt = runtime(e);

    const allowed = await rt.runPromise(Workspaces.use((store) => store.hasAccess(wsId, user.id)));
    if (!allowed) return c.text("forbidden", 403);

    const run = await rt.runPromise(
      ReviewRuns.use((store) => store.getRun(runId)).pipe(
        Effect.provideService(WorkspaceId, { wsId }),
        Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(undefined)),
      ),
    );
    if (run === undefined) return c.text("Review run not found", 404);

    // A browser reconnect carries its position in this header; a first connect replays from 0.
    const last = c.req.header("last-event-id");
    const lastSeq = last !== undefined && /^\d+$/.test(last) ? Number(last) : -1;

    let body: ReadableStream<Uint8Array>;
    try {
      body = await e.runDriver.getByName(runId).stream({ wsId, runId }, lastSeq);
    } catch {
      return c.text("the run driver could not open the stream", 500);
    }

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  });
