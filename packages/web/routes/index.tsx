import type { PageProps } from "fresh";
import type { State } from "@/define.ts";
import FileNavigation from "@/islands/FileNavigation.tsx";
import FileViewer from "@/islands/FileViewer.tsx";
import MarkSwatches from "@/islands/MarkSwatches.tsx";
import Navigation from "@/islands/Navigation.tsx";
import RightSidebar from "@/islands/RightSidebar.tsx";

export default function HomePage({ state }: PageProps<unknown, State>) {
  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col min-h-0 @container text-ink stack stack--col">
        <Navigation user={state.user}>
          <FileNavigation />
        </Navigation>

        <FileViewer />
      </main>

      <RightSidebar />

      {/* TEMPORARY category color preview -- remove once settled. */}
      <MarkSwatches />
    </div>
  );
}
