import type { Mark, MarkStatus } from "@essayist/core";
import Section from "@/islands/Section.tsx";
import { useMarks } from "@/signals/marks.ts";
import { openedFiles } from "@/signals/openedFiles.ts";

function statusBadge(status: MarkStatus) {
  const classes =
    status === "resolved"
      ? "badge badge-success badge-xs"
      : "badge badge-warning badge-xs";
  return <span class={classes}>{status}</span>;
}

function MarkDetail({ mark }: { mark: Mark }) {
  return (
    <div class="text-sm">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-semibold text-base-content/70">
          {mark.label || "Mark"}
        </span>
        {statusBadge(mark.status)}
      </div>
      <div class="text-base-content/50 italic">
        &ldquo;{mark.selected_text}&rdquo;
      </div>
      <div class="text-base-content/80 mt-1">{mark.comment}</div>
      <div class="text-xs text-base-content/60 mt-2 flex gap-3">
        <span>offset: {mark.offset}</span>
        <span>length: {mark.length}</span>
      </div>
    </div>
  );
}

export default function MarksSection() {
  const path = openedFiles.selected.value;
  if (!path) return null;

  return <Marks path={path} />;
}

function Marks({ path }: { path: string }) {
  const { marks, loading } = useMarks(path);

  if (loading.value || marks.value.length === 0) {
    return null;
  }

  return (
    <Section title="Marks">
      <div class="flex flex-col gap-3">
        {marks.value.map((mark) => (
          <MarkDetail key={mark.id} mark={mark} />
        ))}
      </div>
    </Section>
  );
}
