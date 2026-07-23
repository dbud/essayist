import Chat from "@/islands/Chat.tsx";
import ExportPreviewSection from "@/islands/ExportPreviewSection.tsx";
import FileBrowser from "@/islands/FileBrowser.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import LexicalTreeViewSection from "@/islands/LexicalTreeViewSection.tsx";
import MarksSection from "@/islands/MarksSection.tsx";
import Section from "@/islands/Section.tsx";
import Sidebar from "@/islands/Sidebar.tsx";
import WorkspaceMenu from "@/islands/WorkspaceMenu.tsx";

export default function HomePage() {
  return (
    <main class="w-full flex-1 flex gap-8 px-4 min-h-0">
      <Sidebar closeLabel="Close file browser">
        <div class="px-1 pt-1 pb-2 border-b border-base-300">
          <WorkspaceMenu />
        </div>
        <FileBrowser />
      </Sidebar>
      <div class="flex-1 min-w-0 min-h-0 h-full flex flex-col py-4">
        <FileViewer />
      </div>
      <aside class="flex-1 max-w-lg shrink-0 min-h-0 overflow-y-auto flex flex-col py-4">
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
      </aside>
    </main>
  );
}
