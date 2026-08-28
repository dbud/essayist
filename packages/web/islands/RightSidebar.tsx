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
    <Sidebar open={rightSidebarOpened.value} class="bg-surface text-ink">
      <div class="w-128 flex flex-col stack stack--row">
        <ExportPreviewSection />
        <ReviewHistorySection />
        <MarksSection />
        <LexicalTreeViewSection />
        <Section title="Chat">
          <Chat />
        </Section>
      </div>
    </Sidebar>
  );
}
