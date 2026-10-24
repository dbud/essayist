import { PanelRightClose } from "lucide-preact";
import ExportPreviewSection from "#/components/debug/ExportPreviewSection.tsx";
import LexicalTreeViewSection from "#/components/debug/LexicalTreeViewSection.tsx";
import MarksSection from "#/components/debug/MarksSection.tsx";
import ReviewHistorySection from "#/components/debug/ReviewHistorySection.tsx";
import Sidebar from "#/components/ui/Sidebar.tsx";
import { usePreferences } from "#/models/preferences.ts";

export default function RightSidebar() {
  const { debugSidebarOpened } = usePreferences();
  return (
    <Sidebar
      open={debugSidebarOpened.value}
      class="bg-surface text-ink shadow-md"
    >
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
        <ExportPreviewSection />
        <ReviewHistorySection />
        <MarksSection />
        <LexicalTreeViewSection />
        <div class="striped flex-1" />
      </div>
    </Sidebar>
  );
}
