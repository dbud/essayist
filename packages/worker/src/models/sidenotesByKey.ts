import { computed, createModel, type ReadonlySignal, signal } from "@preact/signals";

import { type FileSelection, VersionKey } from "#/models/fileSelection.ts";
import { type Sidenotes, SidenotesModel } from "#/models/sidenotes.ts";

import type { Categories } from "./categories.ts";
import type { ResolvedMarks } from "./resolvedMarks.ts";

export const SidenotesByKeyModel = createModel(
  (
    selected: ReadonlySignal<FileSelection | null>,
    resolvedMarks: ResolvedMarks,
    categories: Categories,
  ) => {
    const scrollTop = signal(0);
    const viewportHeight = signal(0);

    const sidenotes = signal(new Map<string, Sidenotes>());

    // Inert stand-in while no file is selected: no editor exists to measure, so its positions stay
    // empty and nothing writes to it.
    const inert = new SidenotesModel(
      { wsId: "", fileId: "", versionId: "" },
      {
        resolvedMarks,
        categories,
        scrollTop,
        viewportHeight,
      },
    );

    const current = computed((): Sidenotes => {
      const selection = selected.value;
      if (selection === null || selection.fileId === null) return inert;
      return sidenotes.value.getOrInsertComputed(
        VersionKey.cacheKey(selection),
        () =>
          new SidenotesModel(selection, { resolvedMarks, categories, scrollTop, viewportHeight }),
      );
    });

    return { current, scrollTop, viewportHeight };
  },
);

export type SidenotesByKey = InstanceType<typeof SidenotesByKeyModel>;
