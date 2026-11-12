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
import { collectAnchors, collectBlocks, collectFragments } from "./markGeometry.ts";
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

const EMPTY_MEASURED_MARKS: MeasuredMarks = { blocks: [] };

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
      const blocks = collectBlocks(editor, fragments, anchors, marks);
      setIfChanged(measuredMarks, { blocks });

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
