import { define } from "@/define.ts";
import { traceStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { workspaceId } = ctx.state;
    const trace = await traceStore.get({
      workspaceId,
      runId: ctx.params.runId,
    });
    if (!trace) {
      return Response.json({ error: "Trace not found" }, { status: 404 });
    }
    return Response.json(trace);
  }),
};
