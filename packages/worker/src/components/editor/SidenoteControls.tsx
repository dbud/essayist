import { Highlighter } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import ReviewPulse from "#/components/editor/ReviewPulse.tsx";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatDuration } from "#/utils/format.ts";

export default function SidenoteControls() {
  const { writable, reviewRuns, fileTrees, fileVersions } = useEditorModels();
  const review = reviewRuns.current.value;
  // A snapshot has no controls; a pending buffer resolves to no runs model.
  if (!writable.value || review === null) return null;
  const { loading, error, submit, runs } = review;
  const running = runs.value.find((run) => run.status === "running");
  const runAnchor = running?.id ?? runs.value[0]?.id ?? "";

  async function onReview() {
    const result = await submit();
    if (error.value) {
      showToast(error.value, "error");
      return;
    }
    // TODO -- receive promoted version and reviewRun in progress
    void fileTrees.current.value?.load();
    void fileVersions.current.value?.load();
    if (result?.status === "running") showToast("Review started", "success");
    else if (result?.status === "completed") showToast("Review complete", "success");
    else showToast(result?.error ?? "Review failed", "error");
  }

  return (
    <div class="relative flex min-w-72 flex-1 items-center stack stack--row">
      {running !== undefined ? (
        <div class="cell--data relative flex-1">
          Reviewing · <Elapsed startedAt={running.startedAt} />
        </div>
      ) : loading.value ? (
        <div class="cell--data flex-1">Reviewing</div>
      ) : (
        <button type="button" class="btn cell--accent" onClick={onReview}>
          <Highlighter size={14} />
          Review
        </button>
      )}
      <div class="flex-1 self-stretch bg-surface" />
      <ReviewPulse
        runId={runAnchor}
        amplitude={running !== undefined ? 1 : 0}
        class="pointer-events-none absolute inset-0 text-accent"
      />
    </div>
  );
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatDuration(now - startedAt)}</>;
}
