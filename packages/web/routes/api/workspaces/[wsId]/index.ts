import { Workspaces } from "@essayist/core";
import { define } from "@/define.ts";
import { runtime } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const workspace = await runtime.runPromise(
      Workspaces.use((store) => store.getWorkspace(ctx.state.wsId)),
    );
    if (!workspace) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(workspace);
  }),
};
