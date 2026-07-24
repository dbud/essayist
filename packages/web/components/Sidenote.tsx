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
      data-active={active ? "" : undefined}
      class="sidenote absolute left-0 right-0 text-left text-sm p-2 rounded cursor-pointer border-0 appearance-none bg-base-100/60"
      style={{ top: `${top}px`, visibility: hidden ? "hidden" : "visible" }}
      title="Jump to mark in editor"
      onClick={() =>
        editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id)
      }
    >
      <div class="flex items-center gap-2 mb-1">
        <span class="font-semibold text-primary">{number}</span>
        <span class="text-base-content/80">{mark.comment}</span>
        {/*<span class="font-semibold text-base-content/70">
          {mark.label || "Mark"}
        </span>
        <span
          class={`badge badge-xs ${
            mark.status === "resolved" ? "badge-success" : "badge-warning"
          }`}
        >
          {mark.status}
        </span>*/}
      </div>
      {mark.selected_text && (
        <div class="italic text-base-content/50 line-clamp-2">
          &ldquo;{mark.selected_text}&rdquo;
        </div>
      )}
    </button>
  );
}
