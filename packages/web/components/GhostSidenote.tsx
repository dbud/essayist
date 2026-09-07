import type { LexicalEditor } from "lexical";
import { ChevronDown, ChevronUp } from "lucide-preact";
import { colorForMark } from "@/editor/markColors.ts";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";
import type { ScrollContainerRef } from "@/hooks/useScrollViewport.ts";
import type { GhostSidenoteView } from "@/signals/sidenotes.ts";

interface GhostSidenoteProps {
  view: GhostSidenoteView;
  editor: LexicalEditor | null;
  scrollContainerRef: ScrollContainerRef;
}

export default function GhostSidenote({
  view,
  editor,
  scrollContainerRef,
}: GhostSidenoteProps) {
  const { entry, ghost, trueTop } = view;
  const { mark, number } = entry;
  const Icon = ghost === "bottom" ? ChevronDown : ChevronUp;
  const color = colorForMark(mark);
  return (
    // Full-height slot with a flow origin at the column top so the sticky
    // button is always in the stuck state. The slot never intercepts clicks.
    <div class="pointer-events-none absolute inset-x-0 top-0 h-full">
      <button
        type="button"
        class="pointer-events-auto sticky top-0 w-full sidenote is-ghost"
        style={{
          "--mark-color": color,
          translate:
            ghost === "bottom" ? "0 calc(var(--vp-h) - 100%)" : undefined,
        }}
        title="Offscreen; jump to mark"
        onClick={() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = trueTop;
          }
          editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id);
        }}
      >
        <Icon
          size={16}
          class="absolute left-0 -translate-x-full top-1/2 -translate-y-1/2"
        />
        <div class="flex items-start gap-2">
          <span class="font-semibold">{number}</span>
          <div class="min-w-0 flex flex-col gap-1">
            <div class="text-ink">
              {mark.label && <span class="badge mr-2">{mark.label}</span>}
              <span class="min-w-0 flex-1 line-clamp-1">{mark.comment}</span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
