import type { Mark } from "@essayist/core";
import type { LexicalEditor } from "lexical";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";

interface SidenoteProps {
  mark: Mark;
  number: number;
  top: number;
  active: boolean;
  hidden: boolean;
  editor: LexicalEditor | null;
}

export default function Sidenote({
  mark,
  number,
  top,
  active,
  hidden,
  editor,
}: SidenoteProps) {
  return (
    <button
      type="button"
      data-thread-id={mark.thread_id}
      class={`absolute left-0 right-0 text-left text-sm p-2 rounded cursor-pointer border-0 appearance-none transition-[background-color,box-shadow] duration-200 ${
        active
          ? "bg-[var(--color-mark-active)] ring-1 ring-[var(--color-mark)]"
          : "bg-base-100/60"
      }`}
      style={{ top: `${top}px`, visibility: hidden ? "hidden" : "visible" }}
      title="Jump to mark in editor"
      onClick={() =>
        editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id)
      }
    >
      <div class="flex items-start gap-2">
        <span class="font-semibold text-primary">{number}</span>
        <div class="min-w-0 flex flex-col gap-1">
          <div class="text-base-content/80">{mark.comment}</div>
          {mark.status === "stale" && mark.selected_text && (
            <div class="font-serif italic text-base-content/70 line-clamp-2 line-through">
              &ldquo;{mark.selected_text}&rdquo;
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
