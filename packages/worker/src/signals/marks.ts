import type { Mark } from "@essayist/core";
import { type Signal, signal } from "@preact/signals";

// TODO -- ESS-84: real marks resolution via the wasm core replaces this
// stub; the resolved set is empty meanwhile, so marks and sidenotes are
// simply absent.
const resolved = signal<Mark[]>([]);
const loading = signal(false);

export function getMarks(
  _wsId: string,
  _path: string,
  _versionId?: string | null,
): { resolved: Signal<Mark[]>; loading: Signal<boolean> } {
  return { resolved, loading };
}
