import { effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { theme } from "@/signals/preferences.ts";

export type ThemePref = "auto" | "light" | "dark";
export const THEMES: ThemePref[] = ["auto", "light", "dark"];

const LIGHT = "essayist";
const DARK = "essayist-dark";

/** Resolve a theme preference to the concrete daisyUI theme name. */
export function resolveTheme(pref: ThemePref): string {
  if (pref === "auto") {
    if (!IS_BROWSER) return LIGHT;
    return globalThis.matchMedia("(prefers-color-scheme: dark)").matches
      ? DARK
      : LIGHT;
  }
  return pref === "dark" ? DARK : LIGHT;
}

function apply(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

// Keep `<html data-theme>` in sync with the persisted `theme` signal, and follow
// OS preference changes while in `auto`. Runs once when this module is first
// imported in the browser (e.g. by the UserMenu island).
if (IS_BROWSER) {
  apply(theme.value);
  effect(() => apply(theme.value));
  globalThis
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (theme.value === "auto") apply("auto");
    });
}
