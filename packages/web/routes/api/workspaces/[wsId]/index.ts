import { define } from "@/define.ts";
import { workspaceStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const workspace = await workspaceStore.getWorkspace(ctx.state.workspaceId);
    if (!workspace) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(workspace);
  }),
};
