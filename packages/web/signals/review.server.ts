import { registerLoader } from "@/signals/models.server.ts";
import type { ReviewKey } from "@/signals/review.ts";
import { type ReviewData, reviewNs } from "@/signals/review.ts";
import { reviewStore } from "@/store.ts";

export async function reviewLoader({
  workspaceId,
  path,
}: ReviewKey): Promise<ReviewData> {
  return { runs: await reviewStore.listRuns({ workspaceId, fileId: path }) };
}

registerLoader(reviewNs, reviewLoader);
