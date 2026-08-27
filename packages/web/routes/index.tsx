import type { FileEntry, FileSnapshot, Workspace } from "@essayist/core";
import { VirtualFileSystem } from "@essayist/core";
import type { PageProps } from "fresh";
import { define, type State } from "@/define.ts";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import Navigation from "@/islands/Navigation.tsx";
import RightSidebar from "@/islands/RightSidebar.tsx";
import { type SerializedModels, serialize, setSeed } from "@/signals/models.ts";
import { adapter, store } from "@/store.ts";

/**
 * When `?ws=<id>` is present, seed the model store server-side (workspaces list
 * + file tree + the target file + which file is open) from `ctx.state.vfs`, and
 * ship the serialized seeds to the client as the `#__essayist_seed__` blob so
 * the client models hydrate from it and skip the REST fetch for the seeded
 * file. `?file=<path>` is optional; defaults to the first file in the workspace.
 */
export const handler = define.handlers(async (ctx) => {
  const wsId = ctx.url.searchParams.get("ws");
  if (!wsId) return { data: { seed: null satisfies SerializedModels | null } };

  const hasAccess = await store.hasAccess(wsId, ctx.state.user.id);
  if (!hasAccess)
    return { data: { seed: null satisfies SerializedModels | null } };

  const pathParam = ctx.url.searchParams.get("file");
  const vfs = new VirtualFileSystem(adapter, wsId);
  const [workspacesList, files] = await Promise.all([
    store.listWorkspacesForUser(ctx.state.user.id),
    vfs.list(),
  ]);

  const path = pathParam ? decodeURIComponent(pathParam) : files[0]?.path;
  if (!path) return { data: { seed: null satisfies SerializedModels | null } };

  const snapshot = (await vfs
    .read(path)
    .catch(() => null)) as FileSnapshot | null;
  if (!snapshot)
    return { data: { seed: null satisfies SerializedModels | null } };

  setSeed("workspaces", "singleton", {
    list: workspacesList as Workspace[],
    currentId: wsId,
  });
  setSeed("tree", wsId, files as FileEntry[]);
  setSeed("file", `${wsId}:${path}`, snapshot);
  setSeed("openedFiles", wsId, path);

  return { data: { seed: serialize() } };
});

/** Embed JSON safe for inside a <script> (breaks `</script>` sequences). */
function seedScriptHtml(seed: SerializedModels): string {
  return JSON.stringify(seed).replace(/</g, "\\u003c");
}

export default define.page<typeof handler>(
  ({ data, state }: PageProps<{ seed: SerializedModels | null }, State>) => {
    return (
      <div class="flex flex-1 min-h-0">
        {data.seed && (
          <script
            type="application/json"
            id="__essayist_seed__"
            // Inline JSON in a script requires raw inner HTML; `<` is escaped
            // in seedScriptHtml so no `</script>` can terminate early.
            // deno-lint-ignore react-no-danger
            dangerouslySetInnerHTML={{ __html: seedScriptHtml(data.seed) }}
          />
        )}
        <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
          <Navigation user={state.user}>
            <FileNavigation />
          </Navigation>

          <FileViewer />
        </main>

        <RightSidebar />
      </div>
    );
  },
);
