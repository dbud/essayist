import type { ReviewRun, ReviewRunStatus } from "@essayist/core";
import { ScrollText } from "lucide-preact";

import Section from "#/components/debug/Section.tsx";
import MarkdownView from "#/components/MarkdownView.tsx";
import { useEditorModels } from "#/pages/editor/models.ts";

function statusBadge(status: ReviewRunStatus) {
  const classes =
    status === "completed"
      ? "badge badge--success"
      : status === "failed"
        ? "badge badge--error"
        : "badge badge--warning";
  return <span class={classes}>{status}</span>;
}

function RunItem({ run }: { run: ReviewRun }) {
  return (
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2 mb-1">
        {statusBadge(run.status)}
        <span class="text-xs text-ink/60">
          {new Date(run.startedAt).toLocaleString()}
          {run.completedAt && <> ({((run.completedAt - run.startedAt) / 1000).toFixed(1)}s)</>}
        </span>
        <a href={`/traces/${run.wsId}/${run.id}`} class="btn--ghost ml-auto" title="View trace">
          <ScrollText size={14} />
        </a>
      </div>
      {run.status === "failed" && run.error && <div class="text-ink/80 text-xs">{run.error}</div>}
      {run.status === "completed" && run.summary && (
        <MarkdownView content={run.summary} class="text-xs" />
      )}
    </div>
  );
}

export default function ReviewHistorySection() {
  const { reviewRuns } = useEditorModels();
  const review = reviewRuns.current.value;
  if (review === null) return null;
  const { runs, historyLoading } = review;
  if (historyLoading.value || runs.value.length === 0) return null;
  return (
    <Section title="Review history">
      <div class="flex flex-col gap-2">
        {runs.value.map((run) => (
          <RunItem key={run.id} run={run} />
        ))}
      </div>
    </Section>
  );
}
