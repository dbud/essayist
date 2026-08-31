import { computed, effect, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const viewerFont = persistentSignal<string>("viewerFont", "font-serif");
export const viewMode = persistentSignal<string>("viewMode", "auto");

export type HighlightStyle = "band" | "wavy";
export const highlightStyle = persistentSignal<HighlightStyle>(
  "highlightStyle",
  "wavy",
);

export type AppFont = "atkinson" | "gothic" | "system";

const APP_FONT_DEFAULT: AppFont = "atkinson";
export const appFont = persistentSignal<AppFont>("appFont", APP_FONT_DEFAULT);

// data-app-font is consumed by the font axis rules in assets/styles.css
if (IS_BROWSER) {
  effect(() => {
    const root = document.documentElement;
    if (appFont.value === APP_FONT_DEFAULT) {
      root.removeAttribute("data-app-font");
    } else {
      root.dataset.appFont = appFont.value;
    }
  });
}

export type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const systemDark = signal(IS_BROWSER && matchMedia(DARK_QUERY).matches);
if (IS_BROWSER) {
  matchMedia(DARK_QUERY).addEventListener("change", (e) => {
    systemDark.value = e.matches;
  });
}

// null = no override, follow the OS; otherwise the pinned literal value.
export const themeOverride = persistentSignal<Theme | null>(
  "themeOverride",
  null,
);

/** Resolved scheme: the override when pinned, otherwise the system scheme. */
export const theme = computed<Theme>(
  () => themeOverride.value ?? (systemDark.value ? "dark" : "light"),
);

// data-theme is only present while an override is pinned, so the unpinned
// state keeps following prefers-color-scheme with no JS involved.
if (IS_BROWSER) {
  effect(() => {
    const root = document.documentElement;
    if (themeOverride.value) {
      root.dataset.theme = themeOverride.value;
    } else {
      root.removeAttribute("data-theme");
    }
  });
}

/** Two-state toggle rule: never store a value matching the system scheme. */
export function toggleTheme() {
  const system: Theme = systemDark.value ? "dark" : "light";
  const target = theme.value === "dark" ? "light" : "dark";
  themeOverride.value = target === system ? null : target;
}
