import type { Category, Mark } from "@essayist/core";
import type { LexicalEditor } from "lexical";

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
    <li>
      <button
        type="button"
        class={`menu-btn ${active ? "is-selected" : ""}`}
        title="Go to mark in editor"
        disabled={editor === null}
        onClick={() => editor?.dispatchCommand(SELECT_MARK_COMMAND, mark.id)}
      >
        <span class="flex flex-col items-start gap-1 min-w-0 whitespace-normal text-start">
          <span class="flex items-center gap-2">
            {category?.color !== undefined && (
              <span
                class="size-3 shrink-0 rounded-xs"
                style={{ backgroundColor: category.color }}
              />
            )}
            <span>{mark.label || "Mark"}</span>
            <span class={mark.status === "resolved" ? "badge" : "badge badge--warning"}>
              {mark.status}
            </span>
          </span>
          <span class="italic">&ldquo;{mark.selected_text}&rdquo;</span>
          <span class="text-sm">{mark.comment}</span>
          <span class="flex flex-wrap gap-x-2 font-mono text-[0.7rem] text-current/60">
            <span>offset: {mark.offset}</span>
            <span>length: {mark.length}</span>
            <span class="break-all">id: {mark.id}</span>
            <span class="break-all">thread_id: {mark.thread_id}</span>
          </span>
        </span>
      </button>
    </li>
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
      <ul class="menu-rows">
        {current.marks.value.map((mark) => (
          <MarkDetail
            key={mark.id}
            mark={mark}
            category={byLabel.get(mark.label ?? "")}
            active={markIds.has(mark.id)}
            editor={editor}
          />
        ))}
      </ul>
    </Section>
  );
}
