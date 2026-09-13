import { define } from "@/define.ts";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import Navigation from "@/islands/Navigation.tsx";
import RightSidebar from "@/islands/RightSidebar.tsx";
import { getCategories } from "@/signals/categories.ts";
import { getFile } from "@/signals/file.ts";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { getMarks } from "@/signals/marks.ts";
import { seed, settle, settleAll } from "@/signals/models.ts";
import { getOpenedFilesFor } from "@/signals/openedFiles.ts";
import { getWorkspaces } from "@/signals/workspace.ts";

export default define.page(async ({ state }) => {
  const snapshot = await seed(function* () {
    const [workspaces] = yield* settleAll(getWorkspaces(), getCategories());

    const wsId = workspaces.selectedId.value;
    if (!wsId) return;

    const tree = yield* settle(getFileTreeFor(wsId));

    const path = tree.selectedPath.value;
    if (path) {
      getOpenedFilesFor(wsId).open(path);
      yield* settleAll(getFile(wsId, path), getMarks(wsId, path));
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
