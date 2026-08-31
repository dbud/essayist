import { PanelRightClose } from "lucide-preact";
import Sidebar from "@/components/ui/Sidebar.tsx";
import Chat from "@/islands/Chat.tsx";
import ExportPreviewSection from "@/islands/ExportPreviewSection.tsx";
import LexicalTreeViewSection from "@/islands/LexicalTreeViewSection.tsx";
import MarksSection from "@/islands/MarksSection.tsx";
import ReviewHistorySection from "@/islands/ReviewHistorySection.tsx";
import Section from "@/islands/Section.tsx";
import { rightSidebarOpened } from "@/signals/sidebar.ts";

export default function RightSidebar() {
  return (
    <Sidebar
      open={rightSidebarOpened.value}
      class="bg-surface text-ink shadow-md"
    >
      <div class="w-128 flex flex-col h-full stack border-l border border-stroke bg-surface overflow-y-auto">
        <div class="flex stack">
          <div class="cell striped flex-1">Debug</div>
          <button
            type="button"
            class="btn"
            aria-label="Hide sidebar"
            onClick={() => (rightSidebarOpened.value = false)}
          >
            <PanelRightClose size={16} />
          </button>
        </div>
        <ExportPreviewSection />
        <ReviewHistorySection />
        <MarksSection />
        <LexicalTreeViewSection />
        <Section title="Chat">
          <Chat />
        </Section>
        <div class="striped flex-1" />
      </div>
    </Sidebar>
  );
}
