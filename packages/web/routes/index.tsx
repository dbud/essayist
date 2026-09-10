import { define } from "@/define.ts";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import Navigation from "@/islands/Navigation.tsx";
import RightSidebar from "@/islands/RightSidebar.tsx";
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { seed } from "@/signals/models.ts";
import { store } from "@/store.ts";

export default define.page(async ({ url, state }) => {
  const wsId = url.searchParams.get("ws");
  const snapshot =
    wsId && (await store.hasAccess(wsId, state.user.id))
      ? await seed(() => getFileTreeFor(wsId))
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
