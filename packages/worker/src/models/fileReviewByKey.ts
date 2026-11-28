import { computed, createModel, effect, type ReadonlySignal, signal } from "@preact/signals";

import { PENDING_VERSION_ID } from "./fileContent.ts";
import { type FileReview, FileReviewModel } from "./fileReview.ts";
import { FileKey, type FileSelection } from "./fileSelection.ts";
import type { LatestReviewData } from "./marks.data.ts";
import type { ReviewRuns } from "./reviewRuns.ts";

export const FileReviewByPathModel = createModel(
  (
    selected: ReadonlySignal<FileSelection | null>,
    reviewRuns: ReadonlySignal<Pick<ReviewRuns, "active"> | null>,
    data?: LatestReviewData,
  ) => {
    // file key -> version id -> review
    const reviews = signal(new Map<string, Map<string, FileReview>>());

    {
      const selection = selected.value;
      if (data !== undefined && selection !== null && selection.path !== null) {
        reviews.value = new Map([
          [
            FileKey.fileCacheKey(selection),
            new Map([[selection.versionId, new FileReviewModel(selection, data)]]),
          ],
        ]);
      }
    }

    const current = computed(() => {
      const selection = selected.value;
      if (
        selection === null ||
        selection.path === null ||
        selection.versionId === PENDING_VERSION_ID
      ) {
        return null;
      }
      return reviews.value
        .getOrInsertComputed(FileKey.fileCacheKey(selection), () => new Map())
        .getOrInsertComputed(selection.versionId, () => new FileReviewModel(selection));
    });

    /** Drop the cached reviews of every version of a file; the displayed version reloads. */
    function invalidate(file: Pick<FileKey, "wsId" | "path">): void {
      const next = new Map(reviews.peek());
      next.delete(FileKey.fileCacheKey(file));
      reviews.value = next;
    }

    // Marks reload as the review of the selected file places them. The last placed marks reach the
    // stream before the run settles, so the final reload needs no settle event.
    //
    // TODO -- reload marks for a review running on a file that isn't selected
    const marksPlaced = computed(() => reviewRuns.value?.active.value?.progress?.marksPlaced ?? 0);
    const reloadSelected = () => {
      const selection = selected.peek();
      if (selection !== null && selection.path !== null) invalidate(selection);
    };
    effect(() => {
      if (marksPlaced.value > 0) reloadSelected();
    });

    return { current, invalidate };
  },
);

export type FileReviewByPath = InstanceType<typeof FileReviewByPathModel>;
