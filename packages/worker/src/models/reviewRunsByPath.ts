import { computed, createModel, type ReadonlySignal, signal } from "@preact/signals";

import { PENDING_VERSION_ID } from "./fileContent.ts";
import type { FileSelection } from "./fileSelection.ts";
import type { ReviewRunsData } from "./reviewRuns.data.ts";
import { type ReviewRuns, ReviewRunsModel } from "./reviewRuns.ts";

export const ReviewRunsByPathModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: ReviewRunsData | null) => {
    const models = signal(new Map<string, Map<string, ReviewRuns>>());

    {
      const selection = selected.value;
      if (data != null && selection?.path) {
        const { wsId, path } = selection;
        models.value = new Map([[wsId, new Map([[path, new ReviewRunsModel(wsId, path, data)]])]]);
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
      const { wsId, path } = selection;
      return models.value
        .getOrInsertComputed(wsId, () => new Map())
        .getOrInsertComputed(path, () => new ReviewRunsModel(wsId, path));
    });

    return { current };
  },
);

export type ReviewRunsByPath = InstanceType<typeof ReviewRunsByPathModel>;
