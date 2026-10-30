import { type Mark, resolveMarks } from "@essayist/core";
import { computed, type ReadonlySignal } from "@preact/signals";

import type { FileContents } from "./fileContents.ts";
import type { FileMarksByPath } from "./fileMarksByPath.ts";
import { asyncComputed } from "./utils/asyncComputed.ts";
import { deepComputed } from "./utils/deepComputed.ts";

/** Quiet period after an edit before marks are re-anchored. */
const RESOLVE_DEBOUNCE_MS = 60;

/**
 * Map version-bound marks onto the live editor text with the JS core resolver; the wasm port
 * is ESS-90. A resolved mark keeps the id of its input, so a pass produces the same ids as the
 * persisted set.
 */
export function reanchorMarks(
  marks: readonly Mark[],
  oldContent: string,
  newContent: string,
): readonly Mark[] {
  if (newContent === oldContent) return marks;
  return resolveMarks({ marks, oldContent, newContent }).map((mark, i) => ({
    ...mark,
    id: marks[i].id,
  }));
}

/**
 * How the open view stands relative to its persisted marks: the marks are anchored to the version
 * content, while the editor renders the version or its draft. When the two texts match (or nothing
 * is loaded yet) the view is idle and the persisted marks stand as-is; when they differ the view
 * drifts and the resolver re-anchors.
 */
type View =
  | { phase: "idle"; marks: readonly Mark[] }
  | { phase: "drift"; baseline: string; live: string; marks: readonly Mark[] };

export interface ResolvedMarks {
  /** Marks for the open view, anchored on the live editor text. */
  resolved: ReadonlySignal<readonly Mark[]>;
  /** True while an edit is pending a debounced resolution pass. */
  resolving: ReadonlySignal<boolean>;
}

export function createResolvedMarks(
  fileContents: FileContents,
  marks: FileMarksByPath,
): ResolvedMarks {
  const view = computed<View>((): View => {
    const file = fileContents.current.value;
    const fileMarks = marks.current.value;
    if (file === null || fileMarks === null) {
      return { phase: "idle", marks: [] };
    }
    const baseline = file.version.value?.content ?? null;
    const live = file.markdown.value;
    const persisted = fileMarks.marks.value;
    return baseline === null || live === baseline || persisted.length === 0
      ? { phase: "idle", marks: persisted }
      : { phase: "drift", baseline, live, marks: persisted };
  });

  const { stale: reanchoring, value: reanchored } = asyncComputed(
    () => view.value,
    async (input) => {
      if (input.phase === "idle") return input.marks;
      return reanchorMarks(input.marks, input.baseline, input.live);
    },
    {
      debounce: RESOLVE_DEBOUNCE_MS,
      initial: [] as readonly Mark[],
      skip: import.meta.env.SSR,
    },
  );

  // Drifted content keeps the last resolution while the debounced pass runs; otherwise the
  // persisted marks stand as-is.
  const resolved = deepComputed<readonly Mark[]>(() => {
    const v = view.value;
    return v.phase === "drift" ? reanchored.value : v.marks;
  });

  const resolving = computed(() => {
    const v = view.value;
    return v.phase === "drift" && reanchoring.value;
  });

  return { resolved, resolving };
}
