import type { Mark } from "@essayist/core";
import type { LexicalEditor } from "lexical";
import { ChevronDown, ChevronUp } from "lucide-preact";
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
  return (
    <button
      type="button"
      // Ghosts omit data-thread-id so useElementHeights doesn't measure them
      // (the real sidenote is already measured).
      data-thread-id={isGhost ? undefined : mark.thread_id}
      class={`absolute left-0 right-0 text-left text-sm p-2 rounded cursor-pointer border-0 appearance-none transition-[background-color,box-shadow] duration-200 ${
        isGhost
          ? "bg-base-100/50 ring-1 ring-base-300/60"
          : active
            ? "bg-[var(--color-mark-active)] ring-1 ring-[var(--color-mark)]"
            : "bg-base-100/60"
      }`}
      style={{
        top: `${top}px`,
        visibility: hidden ? "hidden" : "visible",
        opacity: isGhost ? 0.65 : undefined,
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
      <div class="flex items-start gap-2">
        <span class="font-semibold text-primary flex items-center gap-0.5">
          {isGhost && <Icon size={14} />}
          {number}
        </span>
        <div class="min-w-0 flex flex-col gap-1">
          <div class={`text-base-content/80 ${isGhost ? "line-clamp-1" : ""}`}>
            {mark.comment}
          </div>
          {!isGhost && mark.status === "stale" && mark.selected_text && (
            <div class="font-serif italic text-base-content/70 line-clamp-2 line-through">
              &ldquo;{mark.selected_text}&rdquo;
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
