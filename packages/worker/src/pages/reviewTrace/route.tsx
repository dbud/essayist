import { ReviewRuns, TraceEvents, WorkspaceId, Workspaces } from "@essayist/core";
import { Effect } from "effect";
import { Hono } from "hono";

import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";

import Page from "./page";

export default new Hono<{ Bindings: Cloudflare.Env }>().get("/:wsId/:runId", async (c) => {
  const user = c.get("auth-user");
  if (user === undefined) return c.redirect("/", 303);
  const { wsId, runId } = c.req.param();
  const rt = runtime(env(c.env));
  const allowed = await rt.runPromise(Workspaces.use((store) => store.hasAccess(wsId, user.id)));
  if (!allowed) return c.redirect("/", 303);
  const found = await rt.runPromise(
    Effect.provideService(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        const traces = yield* TraceEvents;
        return {
          run: yield* runs.getRun(runId),
          trace: yield* traces.get(runId),
        };
      }),
      WorkspaceId,
      { wsId },
    ).pipe(Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(undefined))),
  );
  if (found === undefined) return c.text("Review run not found", 404);
  const { run, trace } = found;
  return c.render(<Page run={run} trace={trace} user={user} />, { title: "review trace" });
});
