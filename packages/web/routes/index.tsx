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
import { getWorkspaces } from "@/signals/workspace.ts";
import { workspaceStore } from "@/store.ts";

export default define.page(async ({ url, state }) => {
  const wsId = url.searchParams.get("ws");
  const fileParam = url.searchParams.get("file");
  const snapshot =
    wsId && (await workspaceStore.hasAccess(wsId, state.user.id))
      ? await seed(async (drain) => {
          getWorkspaces().select(wsId);
          getFileTreeFor(wsId);
          getCategories();
          await drain();
          // TODO: first workspace/file selection is scattered across the
          // client (persisted signals, auto-select effects) and the server
          // (this priming block). Unify into one selection flow (ESS-32).
          const path = fileParam ?? getFileTreeFor(wsId).files.value[0]?.path;
          if (path) {
            getOpenedFilesFor(wsId).open(path);
            getFile(wsId, path);
          }
        })
      : null;

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
