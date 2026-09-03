import type { ReviewProgress } from "@essayist/core";
import { Highlighter } from "lucide-preact";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getReview } from "@/signals/review.ts";
import { showToast } from "@/signals/toast.ts";

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

export default function SidenoteControls({
  wsId,
  path,
}: {
  wsId: string;
  path: string;
}) {
  const review = getReview(wsId, path);
  const { loading, error, progress } = review;

  async function onReview() {
    await review.submit();
    if (error.value) {
      showToast(error.value, "error");
      return;
    }
    const r = review.run.value;
    if (!r) return;
    if (r.status === "completed") showToast("Review complete", "success");
    else showToast(r.error ?? "Review failed", "error");
  }

  return (
    <div class="relative flex min-w-72 flex-1 items-center">
      {loading.value ? (
        <div class="cell--data flex-1">{phaseLabel(progress.value)}</div>
      ) : (
        <button type="button" class="btn cell--accent" onClick={onReview}>
          <Highlighter size={14} />
          Review
        </button>
      )}
      <div class="flex-1 self-stretch bg-surface" />
      <WaveBars
        fill
        amplitude={loading.value ? 1 : 0}
        class="pointer-events-none text-accent"
      />
    </div>
  );
}
