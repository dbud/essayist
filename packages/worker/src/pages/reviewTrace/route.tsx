import { Files, ReviewRuns, TraceEvents, WorkspaceId, Workspaces } from "@essayist/core";
import { Effect } from "effect";
import { Hono } from "hono";

import { encodeUser } from "#/auth/user.ts";
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
        const run = yield* ReviewRuns.use((runs) => runs.getRun(runId));
        const { path } = yield* Files.use((files) => files.file(run.fileId));
        const trace = yield* TraceEvents.use((traces) => traces.get(runId));
        return { run, path, trace };
      }),
      WorkspaceId,
      { wsId },
    ).pipe(
      Effect.catchTags({
        ReviewRunMissingError: () => Effect.succeed(undefined),
        FileMissingError: () => Effect.succeed(undefined),
      }),
    ),
  );
  if (found === undefined) return c.text("Review run not found", 404);
  const { run, path, trace } = found;
  return c.render(
    <Page wsId={wsId} path={path} run={run} trace={trace} user={encodeUser(user)} />,
    {
      title: "review trace",
    },
  );
});
