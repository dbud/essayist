import type { LexicalEditor } from "lexical";
import { MoveDown, MoveUp } from "lucide-preact";
import { colorForMark } from "@/editor/markColors.ts";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";
import { useMediaQuery } from "@/hooks/useMediaQuery.ts";
import type { ScrollContainerRef } from "@/hooks/useScrollViewport.ts";
import type { GhostSidenoteView } from "@/signals/sidenotes.ts";

interface GhostSidenoteProps {
  view: GhostSidenoteView;
  editor: LexicalEditor | null;
  scrollContainerRef: ScrollContainerRef;
  occlusion: number;
}

export default function GhostSidenote({
  view,
  editor,
  scrollContainerRef,
  occlusion,
}: GhostSidenoteProps) {
  const { entry, ghost, trueTop } = view;
  const { mark, number } = entry;
  const Icon = ghost === "bottom" ? MoveDown : MoveUp;
  const color = colorForMark(mark);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    // Full-height slot with a flow origin at the column top so the sticky
    // button is always in the stuck state. The slot never intercepts clicks.
    <div class="ghost-slot">
      <button
        type="button"
        class={`sidenote is-ghost ${entry.active ? "is-active" : ""}${
          ghost === "bottom" ? " ghost-bottom" : ""
        }`}
        style={{
          "--mark-color": color,
          "--ghost-opacity": String(1 - 0.8 * Math.sqrt(occlusion)),
        }}
        title="Offscreen; jump to mark"
        onClick={() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
              top: trueTop,
              behavior: reducedMotion.value ? "instant" : "smooth",
            });
          }
          editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id);
        }}
      >
        <Icon size={16} class="ghost-arrow" />
        <div class="flex items-start gap-2">
          <span class="sidenote-number">{number}</span>
          <div class="min-w-0 flex flex-col gap-1">
            <div class="text-ink">
              {mark.label && <span class="badge mr-2">{mark.label}</span>}
              <span class="min-w-0 flex-1">{mark.comment}</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
