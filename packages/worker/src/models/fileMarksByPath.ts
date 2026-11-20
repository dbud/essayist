import { computed, createModel, effect, type ReadonlySignal, signal } from "@preact/signals";

import { PENDING_VERSION_ID } from "./fileContent.ts";
import { type FileMarks, FileMarksModel } from "./fileMarks.ts";
import { FileKey, type FileSelection } from "./fileSelection.ts";
import type { MarksData } from "./marks.data.ts";
import type { ReviewRuns } from "./reviewRuns.ts";

export const FileMarksByPathModel = createModel(
  (
    selected: ReadonlySignal<FileSelection | null>,
    reviewRuns: ReadonlySignal<Pick<ReviewRuns, "active" | "lastSettled"> | null>,
    data?: MarksData,
  ) => {
    // file key -> version id -> marks
    const marks = signal(new Map<string, Map<string, FileMarks>>());

    {
      const selection = selected.value;
      if (data !== undefined && selection !== null && selection.path !== null) {
        marks.value = new Map([
          [
            FileKey.fileCacheKey(selection),
            new Map([[selection.versionId, new FileMarksModel(selection, data)]]),
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
      return marks.value
        .getOrInsertComputed(FileKey.fileCacheKey(selection), () => new Map())
        .getOrInsertComputed(selection.versionId, () => new FileMarksModel(selection));
    });

    /** Drop the cached marks of every version of a file; the current version reloads. */
    function invalidate(file: Pick<FileKey, "wsId" | "path">): void {
      const next = new Map(marks.peek());
      next.delete(FileKey.fileCacheKey(file));
      marks.value = next;
    }

    // Marks reload as the review of the selected file places them, and once more when it settles.
    const marksPlaced = computed(() => reviewRuns.value?.active.value?.progress?.marksPlaced ?? 0);
    const settledRunId = computed(() => reviewRuns.value?.lastSettled.value?.id ?? null);
    const reloadSelected = () => {
      const selection = selected.peek();
      if (selection !== null && selection.path !== null) invalidate(selection);
    };
    effect(() => {
      if (marksPlaced.value > 0) reloadSelected();
    });
    effect(() => {
      if (settledRunId.value !== null) reloadSelected();
    });

    return { current, invalidate };
  },
);

export type FileMarksByPath = InstanceType<typeof FileMarksByPathModel>;
