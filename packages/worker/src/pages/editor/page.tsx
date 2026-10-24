import RightSidebar from "#/components/debug/RightSidebar.tsx";
import FileNavigation from "#/components/editor/FileNavigation.tsx";
import FileViewer from "#/components/editor/FileViewer.tsx";
import Navigation from "#/components/Navigation.tsx";
import { Toaster } from "#/components/Toaster.tsx";
import Tooltip from "#/components/Tooltip.tsx";
import { useAppState } from "#/state.ts";

function EditorPage() {
  const { user } = useAppState();

  return (
    <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
      <Navigation user={user}>
        <FileNavigation />
      </Navigation>

      <FileViewer />
    </main>
  );
}

export default function Page() {
  return (
    <>
      <div class="flex flex-1 min-h-0">
        <EditorPage />
        <RightSidebar />
      </div>
      <Toaster />
      <Tooltip />
    </>
  );
}
