import { PanelRightClose } from "lucide-preact";

import ErrorBoundary from "#/components/ErrorBoundary.tsx";
import Lazy from "#/components/ui/Lazy.tsx";
import Melt from "#/components/ui/Melt.tsx";
import Sidebar from "#/components/ui/Sidebar.tsx";
import { usePreferences } from "#/models/preferences.ts";

export default function RightSidebar() {
  const { debugSidebarOpened } = usePreferences();
  return (
    <Sidebar open={debugSidebarOpened.value} class="scheme-dark bg-surface striped/5 text-ink">
      <ErrorBoundary>
        <div class="w-128 flex flex-col gap-3 p-3">
          <div class="flex items-center justify-between">
            <span class="px-2">Debug</span>
            <Melt class="inline-flex">
              <button
                type="button"
                class="aq-btn--idle"
                aria-label="Hide sidebar"
                onClick={() => (debugSidebarOpened.value = false)}
              >
                <PanelRightClose />
              </button>
            </Melt>
          </div>
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
