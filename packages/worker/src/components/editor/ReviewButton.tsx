import type { ReviewProgress } from "@essayist/core";
import { useSignal } from "@preact/signals";
import { ChevronDown, Highlighter } from "lucide-preact";

import { type RingSegment, SegmentedRingIcon } from "#/components/ui/icons.tsx";
import Melt from "#/components/ui/Melt.tsx";
import Swap from "#/components/ui/Swap.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatCount } from "#/utils/format.ts";

export default function ReviewButton() {
  const { writable, reviewRuns, fileTrees, fileVersions } = useEditorModels();
  const review = reviewRuns.current.value;
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);
  // A snapshot has no controls; a pending buffer resolves to no runs model.
  if (!writable.value || review === null) return null;
  const { loading, error, active, submit, whenSettled } = review;
  // A run is active from the moment it's submitted until it settles.
  const busy = loading.value || active.value !== null;
  const progress = active.value?.progress ?? null;
  // The menu lists the units of the active run, so it closes as the run settles.
  const expanded = busy && open.value;

  async function onReview() {
    close();
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
    <Melt class="pointer-events-auto inline-flex z-toolbar" ref={ref}>
      <Swap on={busy ? "busy" : "idle"}>
        <button
          type="button"
          class={busy ? "btn" : "btn--accent"}
          aria-expanded={busy ? expanded : undefined}
          aria-label={busy ? progressLabel(progress) : undefined}
          onClick={busy ? () => (open.value = !open.value) : onReview}
        >
          {busy ? (
            <>
              <SegmentedRingIcon
                segments={progress?.units.map(({ state }) => segment(state)) ?? []}
              />
              <span>Review in progress</span>
              <ChevronDown class="chevron ms-10" />
            </>
          ) : (
            <>
              <Highlighter />
              <span>Review</span>
            </>
          )}
          <WaveBars fill amplitude={busy ? 0.5 : 0} class="pointer-events-none text-accent" />
        </button>
      </Swap>
      {progress !== null && progress.units.length > 0 && (
        <div class={`dropdown ${expanded ? "is-open" : ""}`}>
          <div class="menu menu--small">
            <ul class="menu-rows" data-stagger>
              {progress.units.map(({ id, state }) => (
                <li key={id} class="flex items-center gap-2 text-sm p-1">
                  <SegmentedRingIcon segments={[segment(state)]} size={14} />
                  <span>{id}</span>
                  <span class="ms-auto ps-4 opacity-60">{state}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Melt>
  );
}

type UnitState = ReviewProgress["units"][number]["state"];

function segment(state: UnitState): RingSegment {
  if (state === "running") return "active";
  if (state === "completed") return "done";
  return state;
}

function progressLabel(progress: ReviewProgress | null): string {
  if (progress === null) return "Review in progress";
  const ended = progress.units.filter(
    (unit) => unit.state !== "pending" && unit.state !== "running",
  ).length;
  return `Review in progress: ${ended} of ${progress.units.length}`;
}
