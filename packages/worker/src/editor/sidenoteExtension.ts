import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { MarkNode } from "@lexical/mark";
import type { ReadonlySignal, Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";
import type { LexicalEditor } from "lexical";
import { mergeRegister } from "lexical";

import type { MarkedBlock } from "#/geometry/layout.ts";
import { markTops } from "#/geometry/tops.ts";
import type {
  MarkFragmentBadge,
  MarkOrdinals,
  MarkFragmentRect,
  SidenotePositions,
} from "#/models/sidenotes.ts";

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
import { trackNodeKeys } from "./trackNodeKeys.ts";

interface SidenoteConfig {
  sidenotePositions: Signal<SidenotePositions>;
  markOrdinals: Signal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  markedBlocks: Signal<MarkedBlock[]>;
  resolved: ReadonlySignal<readonly Mark[]>;
  fonts: ReadonlyArray<Signal<string>>;
}

export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    {
      sidenotePositions,
      markOrdinals,
      markFragmentBadges,
      markFragmentRects,
      markedBlocks,
      resolved,
      fonts,
    }: SidenoteConfig,
  ) => {
    const measure = () => {
      const marks = resolved.value;
      const ctx = getMeasureContext(editor.getRootElement());
      // A pass that cannot measure retracts every measured publication.
      if (ctx === null) {
        if (sidenotePositions.value.size > 0) sidenotePositions.value = new Map();
        if (markFragmentBadges.value.length > 0) markFragmentBadges.value = [];
        if (markFragmentRects.value.length > 0) markFragmentRects.value = [];
        if (markedBlocks.value.length > 0) markedBlocks.value = [];
        return;
      }

      const anchors = collectAnchors(
        editor,
        ctx,
        marks.filter((m) => m.length === 0),
      );
      const fragments = collectFragments(editor, nodeKeys);

      const tops = markTops(fragments, anchors);
      if (!equal(sidenotePositions.value, tops)) sidenotePositions.value = tops;

      const ordinals = markOrdinals.value;
      markFragmentBadges.value = computeMarkFragmentBadges(fragments, ordinals, ctx);
      markFragmentRects.value = computeMarkFragmentRects(fragments, ctx);

      const blocks = collectBlocks(editor, fragments, anchors);
      if (!equal(markedBlocks.value, blocks)) markedBlocks.value = blocks;
    };

    const [schedule, disposeRafScheduler] = createRafScheduler(measure);

    sidenotePositions.value = new Map();

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
