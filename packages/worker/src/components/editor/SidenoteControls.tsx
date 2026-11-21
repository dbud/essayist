import { Highlighter } from "lucide-preact";

import WaveBars from "#/components/ui/WaveBars.tsx";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatCount } from "#/utils/format.ts";

export default function SidenoteControls() {
  const { writable, reviewRuns, fileTrees, fileVersions } = useEditorModels();
  const review = reviewRuns.current.value;
  // A snapshot has no controls; a pending buffer resolves to no runs model.
  if (!writable.value || review === null) return null;
  const { loading, error, submit, whenSettled } = review;

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
      {loading.value ? (
        <div class="cell--data flex-1">Reviewing</div>
      ) : (
        <button type="button" class="pointer-events-auto aq-melt aq-btn--accent" onClick={onReview}>
          <Highlighter />
          <span>Review</span>
        </button>
      )}
      <WaveBars fill amplitude={loading.value ? 1 : 0} class="pointer-events-none text-accent" />
    </div>
  );
}
