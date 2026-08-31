import { effect } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const viewerFont = persistentSignal<string>("viewerFont", "font-serif");
export const viewMode = persistentSignal<string>("viewMode", "auto");
export const highlightStyle = persistentSignal<"band" | "wavy">(
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
