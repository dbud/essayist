import { PanelRightClose } from "lucide-preact";

import ErrorBoundary from "#/components/ErrorBoundary.tsx";
import Lazy from "#/components/ui/Lazy.tsx";
import Sidebar from "#/components/ui/Sidebar.tsx";
import { usePreferences } from "#/models/preferences.ts";

export default function RightSidebar() {
  const { debugSidebarOpened } = usePreferences();
  return (
    <Sidebar open={debugSidebarOpened.value} class="bg-surface text-ink shadow-md">
      <ErrorBoundary>
        <div class="w-128 flex flex-col h-full stack border-l border border-stroke bg-surface overflow-y-auto">
          <div class="flex stack">
            <div class="cell striped flex-1">Debug</div>
            <button
              type="button"
              class="btn"
              aria-label="Hide sidebar"
              onClick={() => (debugSidebarOpened.value = false)}
            >
              <PanelRightClose size={16} />
            </button>
          </div>
          <Lazy
            active={debugSidebarOpened.value}
            idlePrefetch
            loader={() => import("#/components/debug/DebugSidebarContent.tsx")}
          />
          <div class="striped flex-1" />
        </div>
      </ErrorBoundary>
    </Sidebar>
  );
}
