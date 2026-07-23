import { signal } from "@preact/signals";

export type SidenotePositions = Map<string, number>;

export const sidenotePositions = signal<SidenotePositions>(new Map());
