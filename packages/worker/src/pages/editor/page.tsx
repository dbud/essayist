import RightSidebar from "#/components/debug/RightSidebar.tsx";
import FileEditor from "#/components/editor/FileEditor.tsx";
import ErrorBoundary from "#/components/ErrorBoundary.tsx";
import { Toaster } from "#/components/Toaster.tsx";
import Tooltip from "#/components/Tooltip.tsx";
import MeltFilter from "#/components/ui/MeltFilter.tsx";

export default function Page() {
  return (
    <>
      <div class="flex flex-1 min-h-0">
        <main class="flex flex-1 flex-col min-h-0 @container text-ink">
          <ErrorBoundary>
            <FileEditor />
          </ErrorBoundary>
        </main>
        <RightSidebar />
      </div>
      <Toaster />
      <Tooltip />
      <MeltFilter />
    </>
  );
}
