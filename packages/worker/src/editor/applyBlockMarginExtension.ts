import { defineExtension } from "@lexical/extension";
import type { ReadonlySignal } from "@preact/signals";
import type { LexicalEditor, NodeKey } from "lexical";

import type { Spacer } from "#/geometry/layout.ts";

import { registerSignalsObserver } from "./observers.ts";

interface ApplyBlockMarginConfig {
  margins: ReadonlySignal<ReadonlyMap<NodeKey, Spacer>>;
}

const SETTLE_LIMIT = 3;

export const ApplyBlockMarginExtension = defineExtension({
  name: "apply-block-margin",
  afterRegistration: (editor: LexicalEditor, { margins }: ApplyBlockMarginConfig) => {
    const applied = new Map<NodeKey, Spacer>();
    let unsettled = 0;

    const apply = () => {
      if (unsettled > SETTLE_LIMIT) return;
      const next = margins.value;
      let touched = false;
      for (const [key, spacer] of next) {
        const current = applied.get(key);
        if (current?.before === spacer.before && current.after === spacer.after) continue;
        const el = editor.getElementByKey(key);
        if (el === null) continue;
        el.style.setProperty("--block-spacer-before", `${spacer.before}px`);
        el.style.setProperty("--block-spacer-after", `${spacer.after}px`);
        applied.set(key, { ...spacer });
        touched = true;
      }
      for (const key of applied.keys()) {
        if (next.has(key)) continue;
        const el = editor.getElementByKey(key);
        if (el !== null) {
          el.style.removeProperty("--block-spacer-before");
          el.style.removeProperty("--block-spacer-after");
        }
        applied.delete(key);
        touched = true;
      }
      unsettled = touched ? unsettled + 1 : 0;
      if (unsettled > SETTLE_LIMIT) {
        console.warn("[applyBlockMargins]: block margins failed to settle");
      }
    };

    apply();

    const unregister = registerSignalsObserver([margins], apply);
    return () => {
      unregister();
      for (const key of applied.keys()) {
        const el = editor.getElementByKey(key);
        if (el !== null) {
          el.style.removeProperty("--block-spacer-before");
          el.style.removeProperty("--block-spacer-after");
        }
      }
      applied.clear();
    };
  },
});
