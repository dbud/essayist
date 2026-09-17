import { registerLoader } from "@/signals/models.server.ts";
import type { ReviewKey } from "@/signals/review.ts";
import { type ReviewData, reviewNs } from "@/signals/review.ts";
import { reviewStore } from "@/store.ts";

export async function reviewLoader({
  wsId,
  path,
}: ReviewKey): Promise<ReviewData> {
  return { runs: await reviewStore.listRuns({ wsId, path }) };
}

registerLoader(reviewNs, reviewLoader);
