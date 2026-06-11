import Chat from "@/islands/Chat.tsx";
import FileBrowser from "@/islands/FileBrowser.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import Section from "@/islands/Section.tsx";

export default function HomePage() {
  return (
    <main class="w-full p-4 flex-1 flex gap-8 min-h-0">
      <aside class="w-64 shrink-0">
        <FileBrowser />
      </aside>
      <div class="flex-1 min-w-0 min-h-0 h-full flex flex-col">
        <FileViewer />
      </div>
      <aside class="flex-1 max-w-lg shrink-0 join join-vertical">
        <Section title="Chat">
          <Chat />
        </Section>
        <Section title="File Stats">
          <div class="text-sm text-base-content/50">Coming soon</div>
        </Section>
        <Section title="File History">
          <div class="text-sm text-base-content/50">Coming soon</div>
        </Section>
        <Section title="Unreviewed Marks">
          <div class="text-sm text-base-content/50">Coming soon</div>
        </Section>
      </aside>
    </main>
  );
}
