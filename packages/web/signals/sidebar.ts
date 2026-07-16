import { signal } from "@preact/signals";
import { persistentSignal } from "@/utils/persistentSignal.ts";

export const sidebarCollapsed = persistentSignal("sidebarCollapsed", false);
export const sidebarOverlayOpen = signal(false);
