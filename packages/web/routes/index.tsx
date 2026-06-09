import Chat from "@/islands/Chat.tsx";
import FileBrowser from "@/islands/FileBrowser.tsx";
import FileViewer from "@/islands/FileViewer.tsx";

export default function HomePage() {
  return (
    <main class="container mx-auto p-8 flex-1 flex gap-8">
      <aside class="w-64 shrink-0">
        <FileBrowser />
      </aside>
      <div class="flex-1 min-w-0">
        <FileViewer />
      </div>
      <div class="flex-1 min-w-0">
        <Chat />
      </div>
    </main>
  );
}
