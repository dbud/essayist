import { ReviewRuns, TraceEvents, WorkspaceId, Workspaces } from "@essayist/core";
import { Effect } from "effect";
import { Hono } from "hono";

import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";

import Page from "./page";

export default new Hono().get("/:wsId/:runId", async (c) => {
  const user = c.get("auth-user");
  if (user === undefined) return c.redirect("/", 303);
  const { wsId, runId } = c.req.param();
  const rt = runtime(env(c.env));
  const allowed = await rt.runPromise(Workspaces.use((store) => store.hasAccess(wsId, user.id)));
  if (!allowed) return c.redirect("/", 303);
  const { run, trace } = await rt.runPromise(
    Effect.provideService(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        const traces = yield* TraceEvents;
        return {
          run: yield* runs.getRun(runId),
          trace: (yield* traces.get(runId)) ?? [],
        };
      }),
      WorkspaceId,
      { wsId },
    ),
  );
  if (run === undefined) return c.text("Review run not found", 404);
  return c.render(<Page run={run} trace={trace} user={user} />, { title: "review trace" });
});
