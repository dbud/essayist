import type { Mark } from "@essayist/core";
import type { LexicalEditor } from "lexical";
import { ChevronDown, ChevronUp } from "lucide-preact";
import { colorForMark } from "@/editor/markColors.ts";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";
import type { ScrollContainerRef } from "@/hooks/useScrollViewport.ts";

interface SidenoteProps {
  mark: Mark;
  number: number;
  top: number;
  active: boolean;
  hidden: boolean;
  editor: LexicalEditor | null;
  ghost?: "up" | "down";
  trueTop?: number;
  scrollContainerRef?: ScrollContainerRef;
}

export default function Sidenote({
  mark,
  number,
  top,
  active,
  hidden,
  editor,
  ghost,
  trueTop,
  scrollContainerRef,
}: SidenoteProps) {
  const isGhost = ghost !== undefined;
  const Icon = ghost === "down" ? ChevronDown : ChevronUp;
  const color = colorForMark(mark);
  return (
    <button
      type="button"
      // Ghosts omit data-thread-id so useElementHeights doesn't measure them
      // (the real sidenote is already measured).
      data-thread-id={isGhost ? undefined : mark.thread_id}
      class={`absolute left-0 right-0 sidenote ${
        isGhost ? "is-ghost" : active ? "is-active" : ""
      } ${hidden ? "invisible" : ""}`}
      style={{
        "--mark-color": color,
        top,
        transform: ghost === "down" ? "translateY(-100%)" : undefined,
      }}
      title={isGhost ? "Offscreen; jump to mark" : "Jump to mark in editor"}
      onClick={() => {
        if (isGhost && scrollContainerRef?.current && trueTop !== undefined) {
          scrollContainerRef.current.scrollTop = trueTop;
        }
        editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id);
      }}
    >
      {isGhost && (
        <Icon
          size={16}
          class="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 font-serif"
        />
      )}
      <div class="flex items-start gap-2">
        <span class="font-semibold font-serif">{number}</span>
        <div class="min-w-0 flex flex-col gap-1">
          <div class="text-ink">
            {mark.label && (
              <span
                class="badge mr-1"
                // style={{ "--badge-bg": color }}
              >
                {mark.label}
              </span>
            )}
            <span class={`min-w-0 flex-1 ${isGhost ? "line-clamp-1" : ""}`}>
              {mark.comment}
            </span>
          </div>
          {!isGhost && mark.status === "stale" && mark.selected_text && (
            <div class="font-serif italic text-ink line-clamp-2 line-through">
              &ldquo;{mark.selected_text}&rdquo;
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
