import { effect, type Signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export interface FontOption {
  value: string;
  label: string;
}

export interface FontAxis<F extends string> {
  signal: Signal<F>;
  options: FontOption[];
}

const SANS_FONT_KEY = "sansFont";
const SERIF_FONT_KEY = "serifFont";

export const FONT_AXIS_KEYS = [SANS_FONT_KEY, SERIF_FONT_KEY] as const;

/**
 * A font setting: a persistent signal plus the radio options for the
 * settings menu. The key names the localStorage entry and the html
 * dataset property, so "sansFont" is saved as "sansFont" and applied
 * as data-sans-font, which the font rules in assets/styles.css read.
 */
function fontAxis<F extends string>(
  key: string,
  labels: Record<F, string>,
  fallback: F,
): FontAxis<F> {
  const value = persistentSignal<F>(key, fallback);

  if (IS_BROWSER) {
    effect(() => {
      document.documentElement.dataset[key] = value.value;
    });
  }

  return {
    signal: value,
    options: (Object.keys(labels) as F[]).map((id) => ({
      value: id,
      label: labels[id],
    })),
  };
}

const SANS_FONT_LABELS = {
  atkinson: "Atkinson Hyperlegible",
  gothic: "Special Gothic",
  system: "System",
};
export type SansFont = keyof typeof SANS_FONT_LABELS;

export const sansFont = fontAxis(SANS_FONT_KEY, SANS_FONT_LABELS, "gothic");

const SERIF_FONT_LABELS = {
  vollkorn: "Vollkorn",
  plex: "Plex Serif",
  system: "System",
};
export type SerifFont = keyof typeof SERIF_FONT_LABELS;

export const serifFont = fontAxis(
  SERIF_FONT_KEY,
  SERIF_FONT_LABELS,
  "vollkorn",
);
