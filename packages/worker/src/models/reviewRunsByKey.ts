import { computed, createModel, type ReadonlySignal, signal } from "@preact/signals";

import { PENDING_VERSION_ID } from "./fileContent.ts";
import { FileKey, type FileSelection } from "./fileSelection.ts";
import type { ReviewRunsData, ReviewStreamDetail } from "./reviewRuns.data.ts";
import { type ReviewRuns, ReviewRunsModel } from "./reviewRuns.ts";

export const ReviewRunsByKeyModel = createModel(
  (
    selected: ReadonlySignal<FileSelection | null>,
    detail: ReviewStreamDetail,
    data?: ReviewRunsData | null,
  ) => {
    const models = signal(new Map<string, ReviewRuns>());

    {
      const selection = selected.value;
      if (data != null && selection !== null && selection.fileId !== null) {
        models.value = new Map([
          [FileKey.cacheKey(selection), new ReviewRunsModel(selection, detail, data)],
        ]);
      }
    }

    const current = computed(() => {
      const selection = selected.value;
      if (
        selection === null ||
        selection.fileId === null ||
        selection.versionId === PENDING_VERSION_ID
      ) {
        return null;
      }
      return models.value.getOrInsertComputed(
        FileKey.cacheKey(selection),
        () => new ReviewRunsModel(selection, detail),
      );
    });

    return { current };
  },
);

export type ReviewRunsByKey = InstanceType<typeof ReviewRunsByKeyModel>;
