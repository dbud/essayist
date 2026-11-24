import ErrorBoundary from "#/components/ErrorBoundary.tsx";
import Lazy from "#/components/ui/Lazy.tsx";
import Sidebar from "#/components/ui/Sidebar.tsx";
import { usePreferences } from "#/models/preferences.ts";

export default function RightSidebar() {
  const { debugSidebarOpened } = usePreferences();
  return (
    <Sidebar open={debugSidebarOpened.value} class="scheme-dark bg-paper striped/8 text-ink">
      <ErrorBoundary>
        <div class="w-128 flex flex-col gap-3 p-6">
          <Lazy
            active={debugSidebarOpened.value}
            idlePrefetch
            loader={() => import("#/components/debug/DebugSidebarContent.tsx")}
          />
        </div>
      </ErrorBoundary>
    </Sidebar>
  );
}
