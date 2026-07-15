import { define } from "@/define.ts";
import { store } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const workspaces = await store.listWorkspacesForUser(ctx.state.user.id);
    return Response.json(workspaces);
  }),
};
