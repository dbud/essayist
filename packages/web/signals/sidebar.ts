import { persistentSignal } from "@/utils/persistentSignal.ts";

export const leftSidebarOpened = persistentSignal("leftSidebarOpened", true);
export const rightSidebarOpened = persistentSignal("rightSidebarOpened", false);
export const navigationOpened = persistentSignal("navigationOpened", false);
