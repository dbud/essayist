import { VirtualFileSystem } from "@essayist/core";
import { type TreeData, treeNs } from "@/signals/fileTree.ts";
import { type Context, registerLoader } from "@/signals/models.server.ts";
import { adapter, userStateStore } from "@/store.ts";

export async function fileTreeLoader(
  wsId: string,
  ctx: Context,
): Promise<TreeData> {
  const files = await new VirtualFileSystem(adapter, wsId).list();
  const persisted = await userStateStore.getSelectedFile(ctx.user.id, wsId);
  const intent = ctx.url.searchParams.get("file");
  const known = (p: string | null | undefined): p is string =>
    !!p && files.some((f) => f.path === p);
  const selectedPath = known(intent)
    ? intent
    : known(persisted)
      ? persisted
      : (files[0]?.path ?? null);
  return {
    files,
    selectedPath,
    selectedVersionId: ctx.url.searchParams.get("v"),
  };
}

registerLoader(treeNs, (wsId, ctx) => fileTreeLoader(wsId, ctx));
