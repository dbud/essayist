import { signal } from "@preact/signals";

export const tooltipText = signal<string | null>(null);
export const tooltipX = signal(0);
export const tooltipY = signal(0);
