import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import Navigation from "@/islands/Navigation.tsx";
import RightSidebar from "@/islands/RightSidebar.tsx";
import RouteSync from "@/islands/RouteSync.tsx";

export default function WorkspaceFilePage({
  params,
  state,
}: PageProps<unknown, State>) {
  const wsId = params.wsid;
  // Fresh delivers catch-all params as a single slash-separated string.
  const fileId = params.fileId;

  return (
    <>
      <RouteSync wsId={wsId} fileId={fileId} />
      <div class="flex flex-1 min-h-0">
        <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
          <Navigation user={state.user}>
            <FileNavigation />
          </Navigation>

          <FileViewer />
        </main>

        <RightSidebar />
      </div>
    </>
  );
}
