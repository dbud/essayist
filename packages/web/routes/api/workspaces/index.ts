import { UserState, Workspaces } from "@essayist/core";
import { define } from "@/define.ts";
import { runScoped } from "@/run.ts";
import { seedDemoFiles } from "@/seed.ts";
import { workspacesLoader } from "@/signals/workspace.server.ts";
import { runtime } from "@/store.ts";

export const handler = {
  GET: define.handlers(async ({ state, url }) => {
    return Response.json(await workspacesLoader({ user: state.user, url }));
  }),

  PATCH: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      selectedId?: string;
    } | null;
    const selectedId = body?.selectedId?.trim();
    if (!selectedId) {
      return Response.json({ error: "Missing 'selectedId'" }, { status: 400 });
    }
    const allowed = await runtime.runPromise(
      Workspaces.use((store) => store.hasAccess(selectedId, ctx.state.user.id)),
    );
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    await runtime.runPromise(
      UserState.use((store) =>
        store.setSelectedWorkspace(ctx.state.user.id, selectedId),
      ),
    );
    return new Response(null, { status: 204 });
  }),

  POST: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      name?: string;
    } | null;
    const name = body?.name?.trim();
    if (!name) {
      return Response.json({ error: "Missing 'name'" }, { status: 400 });
    }
    const workspace = await runtime.runPromise(
      Workspaces.use((store) => store.createWorkspace(name, ctx.state.user.id)),
    );
    // Seed the new workspace with the same sample essay + marks used by the
    // demo workspace, so it isn't empty on first open.
    await seedDemoFiles(runScoped(runtime, workspace.id));
    return Response.json(workspace, { status: 201 });
  }),
};
