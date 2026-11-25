import type { CleanupResult, ReviewRunStatus } from "@essayist/core";
import { Trash2 } from "lucide-preact";

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
    <li class="flex gap-2">
      <a href={`/traces/${run.wsId}/${run.id}`} class="menu-btn" title="View trace">
        <span class="flex flex-col items-start gap-1 min-w-0 whitespace-normal text-start">
          <span class="flex items-center gap-2">
            {statusBadge(run.status)}
            <span class="text-xs text-current/60">
              {new Date(run.startedAt).toLocaleString()}
              {completedAt && <> ({((completedAt - run.startedAt) / 1000).toFixed(1)}s)</>}
            </span>
          </span>
          {run.status === "failed" && error && <span class="text-xs">{error}</span>}
          {run.status === "completed" && summary && (
            <MarkdownView content={summary} class="text-xs" />
          )}
        </span>
      </a>
      {onDelete && (
        <button
          type="button"
          class="menu-btn menu-action"
          aria-label="Delete run and its marks"
          onClick={onDelete}
        >
          <Trash2 />
        </button>
      )}
    </li>
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
      <ul class="menu-rows">
        {isAdmin && (
          <li class="flex gap-2">
            <button
              type="button"
              class="menu-btn"
              onClick={() => cleanup(() => review.clear(selection.versionId))}
            >
              <Trash2 />
              Clear version
            </button>
            <button type="button" class="menu-btn" onClick={() => cleanup(() => review.clear())}>
              <Trash2 />
              Clear file
            </button>
          </li>
        )}
        {runs.value.map((run) => (
          <RunItem
            key={run.id}
            run={run}
            onDelete={isAdmin ? () => cleanup(() => review.deleteRun(run.id)) : undefined}
          />
        ))}
      </ul>
    </Section>
  );
}
