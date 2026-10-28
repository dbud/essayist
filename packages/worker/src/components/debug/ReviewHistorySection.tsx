import type { ReviewRun, ReviewRunStatus } from "@essayist/core";

// TODO -- the trace view needs a worker route -- ESS-84
// import { ScrollText } from "lucide-preact";
import Section from "#/components/debug/Section.tsx";
import MarkdownView from "#/components/MarkdownView.tsx";
import { useEditorModels } from "#/pages/editor/models.ts";
import { getReview } from "#/signals/review.ts";

function statusBadge(status: ReviewRunStatus) {
  const classes =
    status === "completed"
      ? "badge badge--success"
      : status === "failed"
        ? "badge badge--error"
        : "badge badge--warning";
  return <span class={classes}>{status}</span>;
}

// TODO -- wsId is unused until the trace view route lands -- ESS-84
function RunItem({ run, wsId: _wsId }: { run: ReviewRun; wsId: string }) {
  return (
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2 mb-1">
        {statusBadge(run.status)}
        <span class="text-xs text-ink/60">
          {new Date(run.startedAt).toLocaleString()}
          {run.completedAt && <> ({((run.completedAt - run.startedAt) / 1000).toFixed(1)}s)</>}
        </span>
        {/* TODO -- the trace view needs a worker route -- ESS-84
        <a
          href={`/workspaces/${wsId}/traces/${run.id}`}
          class="btn--ghost ml-auto"
          title="View trace"
        >
          <ScrollText size={14} />
        </a>
        */}
      </div>
      {run.status === "failed" && run.error && <div class="text-ink/80 text-xs">{run.error}</div>}
      {run.status === "completed" && run.summary && (
        <MarkdownView content={run.summary} class="text-xs" />
      )}
    </div>
  );
}

export default function ReviewHistorySection() {
  const { selected } = useEditorModels();
  const selection = selected.value;
  if (selection === null || selection.path === null) return null;
  return <ReviewHistory wsId={selection.wsId} path={selection.path} />;
}

function ReviewHistory({ wsId, path }: { wsId: string; path: string }) {
  const { runs, historyLoading } = getReview(wsId, path);
  if (historyLoading.value || runs.value.length === 0) return null;
  return (
    <Section title="Review history">
      <div class="flex flex-col gap-2">
        {runs.value.map((run) => (
          <RunItem key={run.id} run={run} wsId={wsId} />
        ))}
      </div>
    </Section>
  );
}
