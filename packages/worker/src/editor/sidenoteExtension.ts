import type { Mark } from "@essayist/core";
import { defineExtension } from "@lexical/extension";
import { MarkNode } from "@lexical/mark";
import type { ReadonlySignal, Signal } from "@preact/signals";
import type { LexicalEditor, NodeKey } from "lexical";
import { mergeRegister } from "lexical";

import type { MarkedBlock } from "#/geometry/layout.ts";
import type {
  MarkAnchorTop,
  MarkFragmentBadge,
  MarkFragmentRect,
  MarkFragmentTop,
  MarkOrdinals,
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
import { setIfChanged } from "./setIfChanged.ts";
import { trackNodeKeys } from "./trackNodeKeys.ts";

interface SidenoteConfig {
  markFragmentTops: Signal<ReadonlyArray<MarkFragmentTop>>;
  markAnchorTops: Signal<ReadonlyArray<MarkAnchorTop>>;
  markOrdinals: ReadonlySignal<MarkOrdinals>;
  markFragmentBadges: Signal<MarkFragmentBadge[]>;
  markFragmentRects: Signal<MarkFragmentRect[]>;
  markedBlocks: Signal<MarkedBlock[]>;
  blocksByMarkId: Signal<ReadonlyMap<string, NodeKey>>;
  resolved: ReadonlySignal<readonly Mark[]>;
  fonts: ReadonlyArray<Signal<string>>;
}

export const SidenoteExtension = defineExtension({
  name: "sidenote",
  afterRegistration: (
    editor: LexicalEditor,
    {
      markFragmentTops,
      markAnchorTops,
      markOrdinals,
      markFragmentBadges,
      markFragmentRects,
      markedBlocks,
      blocksByMarkId,
      resolved,
      fonts,
    }: SidenoteConfig,
  ) => {
    const measure = () => {
      const marks = resolved.value;
      const ctx = getMeasureContext(editor.getRootElement());
      // A pass that cannot measure retracts every measured publication.
      if (ctx === null) {
        setIfChanged(markFragmentTops, []);
        setIfChanged(markAnchorTops, []);
        setIfChanged(markFragmentBadges, []);
        setIfChanged(markFragmentRects, []);
        setIfChanged(markedBlocks, []);
        setIfChanged(blocksByMarkId, new Map());
        return;
      }

      const anchors = collectAnchors(
        editor,
        ctx,
        marks.filter((m) => m.length === 0),
      );
      const fragments = collectFragments(editor, nodeKeys);

      setIfChanged(
        markFragmentTops,
        fragments.map(({ ids, top }) => ({ ids, top })),
      );
      setIfChanged(
        markAnchorTops,
        anchors.map(({ id, top }) => ({ id, top })),
      );

      setIfChanged(
        markFragmentBadges,
        computeMarkFragmentBadges(fragments, markOrdinals.value, ctx),
      );
      setIfChanged(markFragmentRects, computeMarkFragmentRects(fragments, ctx));

      const collected = collectBlocks(editor, fragments, anchors);
      setIfChanged(markedBlocks, collected.blocks);
      setIfChanged(blocksByMarkId, collected.blocksByMarkId);
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
