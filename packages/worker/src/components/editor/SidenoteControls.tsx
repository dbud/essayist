import { Highlighter } from "lucide-preact";

import WaveBars from "#/components/ui/WaveBars.tsx";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";

export default function SidenoteControls() {
  const { writable, reviewRuns } = useEditorModels();
  const review = reviewRuns.current.value;
  // A snapshot has no controls; a pending buffer resolves to no runs model.
  if (!writable.value || review === null) return null;
  const { loading, error, submit } = review;

  async function onReview() {
    const result = await submit();
    if (error.value) {
      showToast(error.value, "error");
      return;
    }
    if (result?.status === "completed") showToast("Review complete", "success");
    else showToast(result?.error ?? "Review failed", "error");
  }

  return (
    <div class="relative flex min-w-72 flex-1 items-center stack stack--row">
      {loading.value ? (
        <div class="cell--data flex-1">Reviewing</div>
      ) : (
        <button type="button" class="btn cell--accent" onClick={onReview}>
          <Highlighter size={14} />
          Review
        </button>
      )}
      <div class="flex-1 self-stretch bg-surface" />
      <WaveBars fill amplitude={loading.value ? 1 : 0} class="pointer-events-none text-accent" />
    </div>
  );
}
