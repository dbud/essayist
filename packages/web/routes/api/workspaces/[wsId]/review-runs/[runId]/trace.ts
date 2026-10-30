import { TraceEvents, WorkspaceId } from "@essayist/core";
import { Effect } from "effect";
import { define } from "#/define.ts";
import { runtime } from "#/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { wsId } = ctx.state;
    const runId = ctx.params.runId;
    const trace = await runtime.runPromise(
      Effect.provideService(
        Effect.gen(function* () {
          const traces = yield* TraceEvents;
          return yield* traces.get(runId);
        }),
        WorkspaceId,
        { wsId },
      ),
    );
    if (!trace) {
      return Response.json({ error: "Trace not found" }, { status: 404 });
    }
    return Response.json(trace);
  }),
};
