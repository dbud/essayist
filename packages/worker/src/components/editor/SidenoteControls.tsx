import { type ReviewProgress, unitsEnded } from "@essayist/core";
import { Highlighter } from "lucide-preact";

import AqSwap from "#/components/ui/AqSwap.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatCount } from "#/utils/format.ts";

export default function SidenoteControls() {
  const { writable, reviewRuns, fileTrees, fileVersions } = useEditorModels();
  const review = reviewRuns.current.value;
  // A snapshot has no controls; a pending buffer resolves to no runs model.
  if (!writable.value || review === null) return null;
  const { loading, error, active, submit, whenSettled } = review;
  // A run is active from the moment it's submitted until it settles.
  const busy = loading.value || active.value !== null;

  async function onReview() {
    const started = await submit();
    // Undefined with no error when a submit is already in flight.
    if (started === undefined) {
      if (error.value) showToast(error.value, "error");
      return;
    }
    // Starting a review saves the draft as a version.
    void fileTrees.current.value?.load();
    void fileVersions.current.value?.load();

    const { run, marksPlaced } = await whenSettled(started.id);
    if (run.status === "completed") {
      showToast(`Review complete · ${formatCount(marksPlaced, "mark")}`, "success");
    } else {
      showToast(run.error ?? "Review failed", "error");
    }
  }

  return (
    <div class="relative flex min-w-72 flex-1 items-center">
      <div class="pointer-events-auto inline-flex aq-melt">
        <AqSwap on={busy ? "busy" : "idle"}>
          <button
            type="button"
            class={busy ? "aq-btn--idle" : "aq-btn--accent"}
            aria-disabled={busy}
            onClick={busy ? undefined : onReview}
          >
            {busy ? (
              <span class="py-2.5">{progressLabel(active.value?.progress ?? null)}</span>
            ) : (
              <>
                <Highlighter />
                <span>Review</span>
              </>
            )}
            <WaveBars fill amplitude={busy ? 0.5 : 0} class="pointer-events-none text-accent" />
          </button>
        </AqSwap>
      </div>
    </div>
  );
}

function progressLabel(progress: ReviewProgress | null): string {
  if (progress === null) return "Reviewing";
  const { units, marksPlaced } = progress;
  return `Review in progress: ${unitsEnded(progress)} of ${units.length} · ${formatCount(marksPlaced, "mark")}`;
}
