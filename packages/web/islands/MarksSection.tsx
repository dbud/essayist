import type { Mark } from "@essayist/core";
import type { LexicalEditor } from "lexical";
import { Crosshair } from "lucide-preact";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";
import Section from "@/islands/Section.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { workspaces } from "@/signals/workspace.ts";

function MarkDetail({
  mark,
  active,
  editor,
}: {
  mark: Mark;
  active: boolean;
  editor: LexicalEditor | null;
}) {
  return (
    <div class="flex flex-col stack">
      <div class="flex stack shadow-md">
        <div class={`cell flex-1 gap-3 ${active ? "is-selected" : ""}`}>
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
          class="btn btn-ghost btn-xs btn-square ml-auto"
          title="Go to mark in editor"
          disabled={editor === null}
          onClick={() => {
            if (editor)
              editor.dispatchCommand(SELECT_MARK_COMMAND, mark.thread_id);
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
  const openedFiles = getOpenedFiles();
  const path = openedFiles?.selected.value ?? "";
  if (!openedFiles || !path) return null;
  return <Marks wsId={workspaces.currentWorkspaceId.value} path={path} />;
}

function Marks({ wsId, path }: { wsId: string; path: string }) {
  const { resolved, loading } = getMarks(wsId, path);
  const markIds = getEditorSelection(wsId, path).markIds.value;
  const editor = activeEditor.value;

  if (loading.value || resolved.value.length === 0) {
    return null;
  }

  return (
    <Section title="Marks">
      <div class="flex flex-col stack">
        {resolved.value.map((mark) => (
          <MarkDetail
            key={mark.id}
            mark={mark}
            active={markIds.has(mark.thread_id)}
            editor={editor}
          />
        ))}
      </div>
    </Section>
  );
}
