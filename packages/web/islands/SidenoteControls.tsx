import { Highlighter } from "lucide-preact";
import Spinner from "@/components/ui/Spinner.tsx";
import { getReview } from "@/signals/review.ts";
import { showToast } from "@/signals/toast.ts";

export default function SidenoteControls({
  wsId,
  path,
}: {
  wsId: string;
  path: string;
}) {
  const review = getReview(wsId, path);
  const { loading, error } = review;

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
    <div class="flex gap-2">
      <button
        type="button"
        class="btn cell--accent"
        disabled={loading.value}
        onClick={onReview}
      >
        <Highlighter size={14} />
        {loading.value ? (
          <>
            Reviewing <Spinner />
          </>
        ) : (
          "Review"
        )}
      </button>
    </div>
  );
}
