import { persistentSignal } from "@/utils/persistentSignal.ts";

export const viewerFont = persistentSignal<string>("viewerFont", "font-serif");
export const viewMode = persistentSignal<string>("viewMode", "auto");
export const highlightStyle = persistentSignal<"band" | "wavy">(
  "highlightStyle",
  "wavy",
);
