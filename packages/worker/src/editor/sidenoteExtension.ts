import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { MarkNode } from "@lexical/mark";
import type { ReadonlySignal, Signal } from "@preact/signals";
import type { LexicalEditor } from "lexical";
import { mergeRegister } from "lexical";

import type { MeasuredMarks } from "#/geometry/layout.ts";
import type { MarkFragmentBadge, MarkOrdinals, MarkFragmentRect } from "#/models/sidenotes.ts";

import { getMeasureContext } from "./domMeasure.ts";
import { computeMarkFragmentBadges } from "./markFragmentBadges.ts";
import { computeMarkFragmentRects } from "./markFragmentRects.ts";
import {
  collectAnchors,
  collectBlocks,
  collectFragments,
  computeMarkTops,
} from "./markGeometry.ts";
import {
  createRafScheduler,
  registerFontLoadObserver,
  registerResizeObserver,
  registerSignalsObserver,
} from "./observers.ts";
import { setIfChanged } from "./setIfChanged.ts";
import { trackNodeKeys } from "./trackNodeKeys.ts";

interface SidenoteConfig {
  measuredMarks: Signal<MeasuredMarks>;
  markOrdinals: ReadonlySignal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  resolved: ReadonlySignal<readonly Mark[]>;
  fonts: ReadonlyArray<Signal<string>>;
}

const EMPTY_MEASURED_MARKS: MeasuredMarks = { blocks: [], blocksByMarkId: new Map(), marks: [] };

export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    {
      measuredMarks,
      markOrdinals,
      markFragmentBadges,
      markFragmentRects,
      resolved,
      fonts,
    }: SidenoteConfig,
  ) => {
    const measure = () => {
      const marks = resolved.value;
      const ctx = getMeasureContext(editor.getRootElement());
      // A pass that cannot measure retracts every measured publication.
      if (ctx === null) {
        setIfChanged(measuredMarks, EMPTY_MEASURED_MARKS);
        setIfChanged(markFragmentBadges, []);
        setIfChanged(markFragmentRects, []);
        return;
      }

      const anchors = collectAnchors(
        editor,
        ctx,
        marks.filter((m) => m.length === 0),
      );
      const fragments = collectFragments(editor, nodeKeys);
      const tops = computeMarkTops(fragments, anchors);
      const { blocks, blocksByMarkId } = collectBlocks(editor, fragments, anchors);
      setIfChanged(measuredMarks, {
        blocks,
        blocksByMarkId,
        marks: marks.flatMap(({ id, offset }) => {
          const top = tops.get(id);
          return top === undefined ? [] : [{ id, top, offset }];
        }),
      });

      setIfChanged(
        markFragmentBadges,
        computeMarkFragmentBadges(fragments, markOrdinals.value, ctx),
      );
      setIfChanged(markFragmentRects, computeMarkFragmentRects(fragments, ctx));
    };

    const [schedule, disposeRafScheduler] = createRafScheduler(measure);

    const [nodeKeys, disposeTrackNodeKeys] = trackNodeKeys(editor, MarkNode, schedule);

    return mergeRegister(
      registerResizeObserver(editor, schedule),
      disposeTrackNodeKeys,
      editor.registerUpdateListener(schedule),
      registerFontLoadObserver(schedule),
      registerSignalsObserver([resolved, ...fonts], schedule),
      disposeRafScheduler,
    );
  },
});
