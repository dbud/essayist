import { type ResolvedMark, resolveMarks } from "@essayist/core";
import { computed, type ReadonlySignal } from "@preact/signals";

import type { FileContents } from "./fileContents.ts";
import type { FileReviewByKey } from "./fileReviewByKey.ts";
import type { MarkData } from "./marks.data.ts";
import { asyncComputed } from "./utils/asyncComputed.ts";
import { deepComputed } from "./utils/deepComputed.ts";

/** Quiet period after an edit before marks are re-anchored. */
const RESOLVE_DEBOUNCE_MS = 60;

/** A mark of the review as the editor shows it: on its text, or stale when the text is gone. */
export type Mark = ResolvedMark<MarkData>;

/**
 * How the open view stands relative to its review: the marks are anchored to the text the review
 * read, while the editor renders a version or its draft. When the two texts match the view is idle
 * and the marks stand as they are; when they differ the view drifts and the resolver re-anchors.
 */
type View =
  | { phase: "idle"; marks: readonly Mark[] }
  | { phase: "drift"; baseline: string; live: string; marks: readonly MarkData[] };

export interface ResolvedMarks {
  /** Marks for the open view, anchored on the live editor text. */
  resolved: ReadonlySignal<readonly Mark[]>;
  /** True while an edit is pending a debounced resolution pass. */
  resolving: ReadonlySignal<boolean>;
}

const asResolved = (marks: readonly MarkData[]): readonly Mark[] =>
  marks.map((mark) => ({ ...mark, status: "resolved" }));

export function createResolvedMarks(
  fileContents: FileContents,
  reviews: FileReviewByKey,
): ResolvedMarks {
  const view = computed<View>((): View => {
    const file = fileContents.current.value;
    const review = reviews.current.value?.latest.value ?? null;
    if (file === null || file.version.value === null || review === null) {
      return { phase: "idle", marks: [] };
    }
    const live = file.markdown.value;
    return live === review.content || review.marks.length === 0
      ? { phase: "idle", marks: asResolved(review.marks) }
      : { phase: "drift", baseline: review.content, live, marks: review.marks };
  });

  const { stale: reanchoring, value: reanchored } = asyncComputed(
    () => view.value,
    async (input) =>
      // the JS resolver of core; the wasm port is ESS-90
      input.phase === "idle"
        ? input.marks
        : resolveMarks({ marks: input.marks, oldContent: input.baseline, newContent: input.live }),
    {
      debounce: RESOLVE_DEBOUNCE_MS,
      initial: [] as readonly Mark[],
      skip: import.meta.env.SSR,
    },
  );

  // Drifted content keeps the last resolution while the debounced pass runs; otherwise the review
  // marks stand as they are.
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
