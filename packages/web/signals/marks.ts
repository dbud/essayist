import type { Mark } from "@essayist/core";
import { resolveMarks } from "@essayist/core";
import { $wrapSelectionInMarkNode } from "@lexical/mark";
import { computed, createModel, effect, signal } from "@preact/signals";
import { assert } from "@std/assert/assert";
import type { EditorState } from "lexical";
import { useFile } from "@/signals/file.ts";
import { activeEditor } from "@/signals.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { createRangeSelection } from "@/utils/createRangeSelection.ts";
import {
  buildTextNodeSpans,
  findRange,
  type NodeRange,
} from "@/utils/textNodeMapping.ts";

export const MarksModel = createModel((path: string) => {
  const { state, content, markdown } = useFile(path);
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState();

  const resolved = computed((): Mark[] => {
    const oldContent = content.value?.content;
    const newContent = markdown.value;
    if (!oldContent || !newContent || marks.value.length === 0) return [];

    return resolveMarks({ marks: marks.value, oldContent, newContent });
  });

  const ranges = computed((): MarkWithRange[] =>
    state.value && markdown.value != null
      ? resolveMarksForEditor(resolved.value, state.value, markdown.value)
      : [],
  );

  // TODO: this is a rough test
  effect(() => {
    const editor = activeEditor.value;
    if (!editor) return;
    editor.update(
      () => {
        console.log("apply ranges");
        ranges.value.forEach(({ mark, range }) => {
          const selection = createRangeSelection(range);
          $wrapSelectionInMarkNode(
            selection,
            /* isBackward */ false,
            mark.thread_id,
          );
        });
      },
      { tag: "mark-range" },
    );
  });

  async function load() {
    const result = await run(async () => {
      const res = await fetch(`/api/files/${encodeURIComponent(path)}/marks`);
      return (await res.json()) as Mark[];
    });
    if (result) marks.value = result;
  }

  load();

  return {
    marks,
    resolved,
    ranges,
    loading,
    error,
    reload: load,
  };
});

const marksMap = new Map<string, InstanceType<typeof MarksModel>>();

export function useMarks(path: string) {
  return marksMap.getOrInsertComputed(path, () => new MarksModel(path));
}

export interface MarkWithRange {
  mark: Mark;
  range: NodeRange;
}

function resolveMarksForEditor(
  resolved: Mark[],
  state: EditorState,
  markdown: string,
): MarkWithRange[] {
  const spans = buildTextNodeSpans(state, markdown);

  const mapped: MarkWithRange[] = [];
  const unmapped: Mark[] = [];

  for (const mark of resolved) {
    const range = findRange(spans, mark.offset, mark.length);
    if (range) {
      mapped.push({ mark, range });
    } else {
      unmapped.push(mark);
    }
  }

  assert(unmapped.length === 0, "unmapped marks should be empty");
  return mapped;
}
