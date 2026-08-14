import { Highlighter } from "lucide-preact";
import Spinner from "@/components/ui/Spinner.tsx";
import { highlightStyle } from "@/signals/preferences.ts";
import { getReview } from "@/signals/review.ts";
import { showToast } from "@/signals/toast.ts";

const OPTIONS = [
  { value: "band", label: "Band" },
  { value: "wavy", label: "Wavy" },
] as const;

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
    <div class="flex items-center gap-4">
      <button
        type="button"
        class="btn btn--accent"
        disabled={loading.value}
        onClick={onReview}
      >
        <Highlighter size={16} />
        {loading.value ? (
          <>
            Reviewing <Spinner />
          </>
        ) : (
          "Review"
        )}
      </button>
      <div class="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            class={`btn btn--ghost ${highlightStyle.value === o.value ? "is-selected" : ""}`}
            onClick={() => (highlightStyle.value = o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
