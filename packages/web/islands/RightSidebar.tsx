import Sidebar from "@/components/ui/Sidebar.tsx";
import Chat from "@/islands/Chat.tsx";
import ExportPreviewSection from "@/islands/ExportPreviewSection.tsx";
import LexicalTreeViewSection from "@/islands/LexicalTreeViewSection.tsx";
import MarksSection from "@/islands/MarksSection.tsx";
import Section from "@/islands/Section.tsx";
import { rightSidebarOpened } from "@/signals/sidebar.ts";

export default function RightSidebar() {
  return (
    <Sidebar open={rightSidebarOpened.value} class="bg-pane text-pane-content">
      <div class="p-4 w-128 flex flex-col gap-4">
        <ExportPreviewSection />
        <MarksSection />
        <LexicalTreeViewSection />
        <Section title="Chat">
          <Chat />
        </Section>
      </div>
    </Sidebar>
  );
}
