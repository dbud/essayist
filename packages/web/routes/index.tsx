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
import { getSelectedFileFor } from "@/signals/selection.ts";
import { getWorkspaces } from "@/signals/workspace.ts";

export default define.page(async ({ url, state }) => {
  const urlFile = url.searchParams.get("file");

  const snapshot = await seed(async (drain) => {
    const workspaces = getWorkspaces();
    getCategories();
    await drain();

    const wsId = workspaces.selectedId.value;
    if (!wsId) return;

    getFileTreeFor(wsId);
    getSelectedFileFor(wsId);
    await drain();

    const files = getFileTreeFor(wsId).files.value;
    const known = (p: string | null | undefined): p is string =>
      !!p && files.some((f) => f.path === p);
    const persisted = getSelectedFileFor(wsId).path.value;
    const path = known(urlFile)
      ? urlFile
      : known(persisted)
        ? persisted
        : files[0]?.path;
    if (path) {
      getOpenedFilesFor(wsId).open(path);
      getFile(wsId, path);
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
