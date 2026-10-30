import type { Category, Mark } from "@essayist/core";
import type { LexicalEditor } from "lexical";
import { Crosshair } from "lucide-preact";

import Section from "#/components/debug/Section.tsx";
import { SELECT_MARK_COMMAND } from "#/editor/markExtension.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { activeEditor } from "#/signals/activeEditor.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";

function MarkDetail({
  mark,
  category,
  active,
  editor,
}: {
  mark: Mark;
  category: Category | undefined;
  active: boolean;
  editor: LexicalEditor | null;
}) {
  return (
    <div class="flex flex-col stack">
      <div class="flex stack shadow-md">
        <div class={`cell flex-1 gap-3 ${active ? "is-selected" : ""}`}>
          {category?.color !== undefined && (
            <span class="size-3 shrink-0" style={{ backgroundColor: category.color }} />
          )}
          <span>{mark.label || "Mark"}</span>
          <span
            class={`self-start
              ${mark.status === "resolved" ? "badge" : "badge badge--warning"}`}
          >
            {mark.status}
          </span>
        </div>
        <button
          type="button"
          class="btn ml-auto"
          title="Go to mark in editor"
          disabled={editor === null}
          onClick={() => {
            if (editor) editor.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id);
          }}
        >
          <Crosshair size={14} />
        </button>
      </div>
      <div class="cell--data flex-col gap-2">
        <div class="italic">&ldquo;{mark.selected_text}&rdquo;</div>
        <div class="">{mark.comment}</div>
        <div class="flex gap-2 text-ink/60 font-mono">
          <span>offset: {mark.offset}</span>
          <span>length: {mark.length}</span>
          <span>id: {mark.id}</span>
          <span>thread_id: {mark.thread_id}</span>
        </div>
      </div>
    </div>
  );
}

export default function MarksSection() {
  const { selected, marks, categories } = useEditorModels();
  const selection = selected.value;
  const current = marks.current.value;
  if (selection === null || selection.path === null || current === null) {
    return null;
  }
  const byLabel = categories.byLabel.value;
  const markIds = getEditorSelection(selection).markIds.value;
  const editor = activeEditor.value;

  if (current.loading.value || current.marks.value.length === 0) {
    return null;
  }

  return (
    <Section title="Marks">
      <div class="flex flex-col stack">
        {current.marks.value.map((mark) => (
          <MarkDetail
            key={mark.id}
            mark={mark}
            category={byLabel.get(mark.label ?? "")}
            active={markIds.has(mark.thread_id)}
            editor={editor}
          />
        ))}
      </div>
    </Section>
  );
}
