import type { ThemePref } from "@/signals/theme.ts";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const viewerFont = persistentSignal<string>("viewerFont", "font-serif");
export const viewMode = persistentSignal<string>("viewMode", "auto");
export const theme = persistentSignal<ThemePref>("theme", "auto");
