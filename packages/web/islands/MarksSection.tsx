import type { Mark, MarkStatus } from "@essayist/core";
import type { LexicalEditor } from "lexical";
import { Crosshair } from "lucide-preact";
import { SELECT_MARK_COMMAND } from "@/editor/markExtension.ts";
import Section from "@/islands/Section.tsx";
import { activeEditor } from "@/signals/activeEditor.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getMarks } from "@/signals/marks.ts";
import { getOpenedFiles } from "@/signals/openedFiles.ts";
import { workspaces } from "@/signals/workspace.ts";

function statusBadge(status: MarkStatus) {
  const classes =
    status === "resolved"
      ? "badge badge-success badge-xs"
      : "badge badge-warning badge-xs";
  return <span class={classes}>{status}</span>;
}

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
    <div
      class={`text-sm p-2 rounded ${
        active ? "bg-primary/10 ring-1 ring-primary/30" : ""
      }`}
    >
      <div class="flex items-center gap-2 mb-1">
        <span class="font-semibold text-base-content/70">
          {mark.label || "Mark"}
        </span>
        {statusBadge(mark.status)}
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
      <div class="text-base-content/50 italic">
        &ldquo;{mark.selected_text}&rdquo;
      </div>
      <div class="text-base-content/80 mt-1">{mark.comment}</div>
      <div class="text-xs text-base-content/60 mt-2 flex gap-3">
        <span>offset: {mark.offset}</span>
        <span>length: {mark.length}</span>
        <span>thread_id: {mark.thread_id}</span>
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
  const { resolved, loading } = getMarks(path);
  const markIds = getEditorSelection(wsId, path).markIds.value;
  const editor = activeEditor.value;

  if (loading.value || resolved.value.length === 0) {
    return null;
  }

  return (
    <Section title="Marks">
      <div class="flex flex-col gap-3">
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
