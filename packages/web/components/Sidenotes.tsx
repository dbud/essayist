import type { LexicalEditor } from "lexical";
import GhostSidenote from "@/components/GhostSidenote.tsx";
import Sidenote from "@/components/Sidenote.tsx";
import { useElementHeights } from "@/hooks/useElementHeights.ts";
import type { ScrollContainerRef } from "@/hooks/useScrollViewport.ts";
import { getSidenotes } from "@/signals/sidenotes.ts";

interface SidenotesProps {
  wsId: string;
  path: string;
  editor: LexicalEditor | null;
  scrollContainerRef: ScrollContainerRef;
}

export default function Sidenotes({
  wsId,
  path,
  editor,
  scrollContainerRef,
}: SidenotesProps) {
  const {
    heights,
    entries,
    viewportLayout,
    topGhost,
    bottomGhost,
    viewportHeight,
  } = getSidenotes(wsId, path);
  // Measure rendered sidenote heights for stacking. Re-measure when the
  // entries change and on marks-column width changes. `entries` is independent
  // of `heights`, so this can't cycle with its own output. Sidenotes stay
  // visibility:hidden until measured so the unstacked first paint never shows
  // overlap. Ghosts omit data-thread-id so they aren't measured.
  const innerRef = useElementHeights<HTMLDivElement>(heights, {
    selector: "[data-thread-id]",
    key: "threadId",
    deps: [entries.value],
  });

  return (
    <div
      class="relative h-full"
      ref={innerRef}
      style={{ "--vp-h": `${viewportHeight.value}px` }}
    >
      {viewportLayout.value.map((v) => (
        <Sidenote key={v.key} view={v} editor={editor} />
      ))}
      {bottomGhost.value && (
        <GhostSidenote
          key={bottomGhost.value.key}
          view={bottomGhost.value}
          editor={editor}
          scrollContainerRef={scrollContainerRef}
        />
      )}
      {topGhost.value && (
        <GhostSidenote
          key={topGhost.value.key}
          view={topGhost.value}
          editor={editor}
          scrollContainerRef={scrollContainerRef}
        />
      )}
    </div>
  );
}
