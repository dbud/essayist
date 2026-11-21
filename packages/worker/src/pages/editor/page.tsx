import RightSidebar from "#/components/debug/RightSidebar.tsx";
import FileEditor from "#/components/editor/FileEditor.tsx";
import FontSelect from "#/components/editor/FontSelect.tsx";
import ErrorBoundary from "#/components/ErrorBoundary.tsx";
import SettingsMenu from "#/components/settings/SettingsMenu.tsx";
import ThemeToggle from "#/components/ThemeToggle.tsx";
import { Toaster } from "#/components/Toaster.tsx";
import Tooltip from "#/components/Tooltip.tsx";
import { useAppState } from "#/state.ts";

export default function Page() {
  const { user } = useAppState();

  return (
    <>
      <div class="flex flex-1 min-h-0">
        <main class="relative flex flex-1 flex-col min-h-0 @container text-ink">
          <ErrorBoundary>
            <FileEditor />
          </ErrorBoundary>
          <div
            class="content-layout z-panel absolute inset-x-0 top-0 pointer-events-none"
            data-scroll-gap="top"
          >
            <div class="col-start-2 content-side relative flex justify-end py-3">
              <div class="pointer-events-auto flex items-center gap-4">
                <FontSelect />
                <ThemeToggle />
                {user && <SettingsMenu user={user} />}
              </div>
            </div>
          </div>
        </main>
        <RightSidebar />
      </div>
      <Toaster />
      <Tooltip />
    </>
  );
}
