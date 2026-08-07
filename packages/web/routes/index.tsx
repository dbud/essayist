import type { PageProps } from "fresh";
import Sidebar from "@/components/ui/Sidebar.tsx";
import type { State } from "@/define.ts";
import Chat from "@/islands/Chat.tsx";
import ExportPreviewSection from "@/islands/ExportPreviewSection.tsx";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import LexicalTreeViewSection from "@/islands/LexicalTreeViewSection.tsx";
import MarksSection from "@/islands/MarksSection.tsx";
import Navigation from "@/islands/Navigation.tsx";
import Section from "@/islands/Section.tsx";
import { rightSidebarOpened } from "@/signals/sidebar.ts";

export default function HomePage({ state }: PageProps<unknown, State>) {
  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col min-h-0 @container bg-paper text-ink">
        <Navigation user={state.user}>
          <FileNavigation />
        </Navigation>

        <FileViewer />
      </main>

      <Sidebar
        open={rightSidebarOpened.value}
        class="bg-pane text-pane-content"
      >
        <div class="join join-vertical">
          <ExportPreviewSection />
          <MarksSection />
          <LexicalTreeViewSection />
          <Section title="Chat">
            <Chat />
          </Section>
          <Section title="File Stats">
            <div class="text-sm text-base-content/50">Coming soon</div>
          </Section>
          <Section title="File History">
            <div class="text-sm text-base-content/50">Coming soon</div>
          </Section>
        </div>
      </Sidebar>
    </div>
  );
}
