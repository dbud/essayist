import { Files, UserState } from "@essayist/core";
import { runScoped } from "@/run.ts";
import { type TreeData, treeNs } from "@/signals/fileTree.ts";
import { type Context, registerLoader } from "@/signals/models.server.ts";
import { runtime } from "@/store.ts";

export async function fileTreeLoader(
  wsId: string,
  ctx: Context,
): Promise<TreeData> {
  const files = await runScoped(
    runtime,
    wsId,
  )(Files.use((files) => files.list()));
  const persisted = await runtime.runPromise(
    UserState.use((store) => store.getSelectedFile(ctx.user.id, wsId)),
  );
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
