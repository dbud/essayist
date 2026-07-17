import { VirtualFileSystem } from "@essayist/core";
import { define } from "@/define.ts";
import { seedDemoFiles } from "@/seed.ts";
import { adapter, store } from "@/store.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const workspaces = await store.listWorkspacesForUser(ctx.state.user.id);
    return Response.json(workspaces);
  }),

  POST: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      name?: string;
    } | null;
    const name = body?.name?.trim();
    if (!name) {
      return Response.json({ error: "Missing 'name'" }, { status: 400 });
    }
    const workspace = await store.createWorkspace(name, ctx.state.user.id);
    // Seed the new workspace with the same sample files + marks used by the
    // demo workspace, plus a workspace-specific readme, so it isn't empty on
    // first open.
    await seedDemoFiles(
      new VirtualFileSystem(adapter, workspace.id),
      workspace,
    );
    return Response.json(workspace, { status: 201 });
  }),
};
