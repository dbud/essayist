import type { LexicalEditor } from "lexical";
import { colorForMark } from "@/editor/markColors.ts";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";
import type { SidenoteView } from "@/signals/sidenotes.ts";

interface SidenoteProps {
  view: SidenoteView;
  editor: LexicalEditor | null;
}

export default function Sidenote({ view, editor }: SidenoteProps) {
  const { entry, top, height } = view;
  const { mark, number, active } = entry;
  const color = colorForMark(mark);
  return (
    <button
      type="button"
      data-thread-id={mark.thread_id}
      // visibility:hidden until measured so the unstacked first paint never
      // shows overlap.
      class={`absolute left-0 right-0 sidenote ${active ? "is-active" : ""} ${
        height > 0 ? "" : "invisible"
      }`}
      style={{ "--mark-color": color, top }}
      title="Jump to mark in editor"
      onClick={() =>
        editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id)
      }
    >
      <div class="flex items-start gap-2">
        <span class="font-semibold">{number}</span>
        <div class="min-w-0 flex flex-col gap-1">
          <div class="text-ink">
            {mark.label && (
              <span
                class="badge mr-2"
                // style={{ "--badge-bg": color }}
              >
                {mark.label}
              </span>
            )}
            <span class="min-w-0 flex-1">{mark.comment}</span>
          </div>
          {mark.status === "stale" && mark.selected_text && (
            <div class="font-serif italic text-ink line-clamp-2 line-through">
              &ldquo;{mark.selected_text}&rdquo;
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
