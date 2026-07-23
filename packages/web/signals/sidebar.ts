import { persistentSignal } from "@/utils/persistentSignal.ts";

export const leftSidebarCollapsed = persistentSignal(
  "leftSidebarCollapsed",
  false,
);
export const rightSidebarCollapsed = persistentSignal(
  "rightSidebarCollapsed",
  false,
);
