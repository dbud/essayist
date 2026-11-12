import { defineExtension } from "@lexical/extension";
import type { ReadonlySignal } from "@preact/signals";
import type { LexicalEditor, NodeKey } from "lexical";

import { registerSignalsObserver } from "./observers.ts";

interface ApplyBlockMarginConfig {
  margins: ReadonlySignal<ReadonlyMap<NodeKey, number>>;
}

export const ApplyBlockMarginExtension = defineExtension({
  name: "apply-block-margin",
  afterRegistration: (editor: LexicalEditor, { margins }: ApplyBlockMarginConfig) => {
    const applied = new Map<NodeKey, number>();

    const apply = () => {
      const next = margins.value;
      for (const [key, value] of next) {
        if (applied.get(key) === value) continue;
        const el = editor.getElementByKey(key);
        if (el === null) continue;
        el.style.marginTop = `${value}px`;
        applied.set(key, value);
      }
      for (const key of applied.keys()) {
        if (next.has(key)) continue;
        const el = editor.getElementByKey(key);
        if (el !== null) el.style.marginTop = "";
        applied.delete(key);
      }
    };

    apply();

    const unregister = registerSignalsObserver([margins], apply);
    return () => {
      unregister();
      for (const key of applied.keys()) {
        const el = editor.getElementByKey(key);
        if (el !== null) el.style.marginTop = "";
      }
      applied.clear();
    };
  },
});
