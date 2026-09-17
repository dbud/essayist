import type { ReviewProgress } from "@essayist/core";
import { ChevronDown, Highlighter, RotateCcw, X } from "lucide-preact";
import { useMemo } from "preact/hooks";
import Dropdown, {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/Dropdown.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import type { FileKey } from "@/signals/file.ts";
import { getMarks } from "@/signals/marks.ts";
import { replayParams, setReplayParams } from "@/signals/replay.ts";
import { getReview } from "@/signals/review.ts";
import { showToast } from "@/signals/toast.ts";
import { delayedRise } from "@/utils/delayedRise.ts";

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

type Speed = (typeof SPEEDS)[number];

function speedLabel(speed: Speed): string {
  return `${speed}x`;
}

function phaseLabel(progress: ReviewProgress | null): string {
  switch (progress?.phase) {
    case "reading":
      return "Reading";
    case "annotating":
      return progress.notes > 0 ? `Marks · ${progress.notes}` : "Marking";
    case "summarizing":
      return "Writing up";
    default:
      return "Reviewing";
  }
}

export default function SidenoteControls({ wsId, path, versionId }: FileKey) {
  const review = getReview(wsId, path);
  const { loading, error, progress } = review;
  const { resolving } = getMarks(wsId, path);
  const replay = replayParams.value;

  // Bars only rise when marks resolution outlives the delay, so quick
  // re-resolutions after typing never flash the pane.
  const resolvingVisible = useMemo(
    () => delayedRise(resolving, 150),
    [resolving],
  );

  async function runAndToast(action: () => Promise<unknown>) {
    await action();
    if (error.value) {
      showToast(error.value, "error");
      return;
    }
    const r = review.run.value;
    if (!r) return;
    if (r.status === "completed") showToast("Review complete", "success");
    else showToast(r.error ?? "Review failed", "error");
  }

  function onReview() {
    return runAndToast(() => review.submit());
  }

  function onReplay() {
    if (!replay) return;
    return runAndToast(() =>
      review.replayRun(replay.runId, {
        speed: () => replayParams.value?.speed ?? 1,
      }),
    );
  }

  // Snapshot views have no review controls
  // TODO -- rework when sidenotes filters arrive
  if (versionId) return null;

  return (
    <div class="relative flex min-w-72 flex-1 items-center stack stack--row">
      {loading.value ? (
        <div class="cell--data flex-1">{phaseLabel(progress.value)}</div>
      ) : replay ? (
        <button type="button" class="btn cell--accent" onClick={onReplay}>
          <RotateCcw size={14} />
          Replay
        </button>
      ) : (
        <button type="button" class="btn cell--accent" onClick={onReview}>
          <Highlighter size={14} />
          Review
        </button>
      )}
      {replay && (
        <>
          <Dropdown
            tooltip="Replay speed"
            trigger={
              <>
                <span>{speedLabel(replay.speed)}</span>
                <ChevronDown size={14} class="rotate-on-open" />
              </>
            }
          >
            {(close) => (
              <DropdownMenu>
                {SPEEDS.map((speed) => (
                  <DropdownItem
                    key={speed}
                    selected={speed === replay.speed}
                    onClick={() => {
                      setReplayParams({ runId: replay.runId, speed });
                      close();
                    }}
                  >
                    {speedLabel(speed)}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            )}
          </Dropdown>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square"
            title="Exit replay mode"
            onClick={() => setReplayParams(null)}
          >
            <X size={14} />
          </button>
        </>
      )}
      <div class="flex-1 self-stretch bg-surface" />
      <WaveBars
        fill
        amplitude={loading.value || resolvingVisible.value ? 1 : 0}
        class="pointer-events-none text-accent"
      />
    </div>
  );
}
