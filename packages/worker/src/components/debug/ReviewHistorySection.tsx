import type { CleanupResult, ReviewRunStatus } from "@essayist/core";
import { ScrollText, Trash2 } from "lucide-preact";

import Section from "#/components/debug/Section.tsx";
import MarkdownView from "#/components/MarkdownView.tsx";
import type { ReviewRunData } from "#/models/reviewRuns.data.ts";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { useAppState } from "#/state.ts";
import { formatCount } from "#/utils/format.ts";

function statusBadge(status: ReviewRunStatus) {
  const classes =
    status === "completed"
      ? "badge badge--success"
      : status === "failed"
        ? "badge badge--error"
        : "badge badge--warning";
  return <span class={classes}>{status}</span>;
}

function RunItem({ run, onDelete }: { run: ReviewRunData; onDelete?: () => void }) {
  const { completedAt, error, summary } = run;
  return (
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2 mb-1">
        {statusBadge(run.status)}
        <span class="text-xs text-ink/60">
          {new Date(run.startedAt).toLocaleString()}
          {completedAt && <> ({((completedAt - run.startedAt) / 1000).toFixed(1)}s)</>}
        </span>
        <a href={`/traces/${run.wsId}/${run.id}`} class="btn--ghost ml-auto" title="View trace">
          <ScrollText size={14} />
        </a>
        {onDelete && (
          <button
            type="button"
            class="btn--ghost"
            title="Delete run and its marks"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {run.status === "failed" && error && <div class="text-ink/80 text-xs">{error}</div>}
      {run.status === "completed" && summary && <MarkdownView content={summary} class="text-xs" />}
    </div>
  );
}

export default function ReviewHistorySection() {
  const { user } = useAppState();
  const { selected, reviewRuns, marks } = useEditorModels();
  const review = reviewRuns.current.value;
  const selection = selected.value;
  if (review === null || selection === null || selection.path === null) return null;
  const { runs, historyLoading } = review;
  const isAdmin = user?.role === "admin";
  if (historyLoading.value || (runs.value.length === 0 && !isAdmin)) return null;

  const cleanup = async (task: () => Promise<CleanupResult>) => {
    try {
      const result = await task();
      marks.invalidate(selection);
      showToast(
        `Deleted ${formatCount(result.runs, "run")} and ${formatCount(result.marks, "mark")}`,
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  return (
    <Section title="Review history">
      {isAdmin && (
        <div class="flex stack stack--row">
          <button
            type="button"
            class="btn"
            onClick={() => cleanup(() => review.clear(selection.versionId))}
          >
            Clear version
          </button>
          <button type="button" class="btn" onClick={() => cleanup(() => review.clear())}>
            Clear file
          </button>
        </div>
      )}
      <div class="flex flex-col gap-2">
        {runs.value.map((run) => (
          <RunItem
            key={run.id}
            run={run}
            onDelete={isAdmin ? () => cleanup(() => review.deleteRun(run.id)) : undefined}
          />
        ))}
      </div>
    </Section>
  );
}
