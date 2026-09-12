import { define } from "@/define.ts";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import Navigation from "@/islands/Navigation.tsx";
import RightSidebar from "@/islands/RightSidebar.tsx";
import { getCategories } from "@/signals/categories.ts";
import { getFile } from "@/signals/file.ts";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { seed } from "@/signals/models.ts";
import { getOpenedFilesFor } from "@/signals/openedFiles.ts";
import {
  getSelectedFileFor,
  getSelectedWorkspace,
} from "@/signals/selection.ts";
import { getWorkspaces } from "@/signals/workspace.ts";

export default define.page(async ({ url, state }) => {
  const urlWs = url.searchParams.get("ws");
  const urlFile = url.searchParams.get("file");

  const snapshot = await seed(async (drain) => {
    const workspaces = getWorkspaces();
    getSelectedWorkspace();
    getCategories();
    await drain();

    // Priority: URL, then persisted selection, then first.
    const list = workspaces.list.value;
    const ws =
      list.find((w) => w.id === urlWs) ??
      list.find((w) => w.id === getSelectedWorkspace().workspaceId.value) ??
      list[0];
    if (!ws) return;

    workspaces.select(ws.id);
    getFileTreeFor(ws.id);
    getSelectedFileFor(ws.id);
    await drain();

    const files = getFileTreeFor(ws.id).files.value;
    const known = (p: string | null | undefined): p is string =>
      !!p && files.some((f) => f.path === p);
    const persisted = getSelectedFileFor(ws.id).path.value;
    const path = known(urlFile)
      ? urlFile
      : known(persisted)
        ? persisted
        : files[0]?.path;
    if (path) {
      getOpenedFilesFor(ws.id).open(path);
      getFile(ws.id, path);
    }
  });

  return (
    <div class="flex flex-1 min-h-0">
      {snapshot && <div id="__essayist_seed__" hidden data-seed={snapshot} />}
      <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
        <Navigation user={state.user}>
          <FileNavigation />
        </Navigation>

        <FileViewer />
      </main>

      <RightSidebar />
    </div>
  );
});
