// Client for the marks-resolution worker. Posts `{marks, oldContent,
// newContent}`, awaits the resolved `Mark[]`. The worker runs `resolveMarks`
// (sync, in `@essayist/core`) on its own thread, so the main thread never
// blocks on the diff and never loads wasm.
//
// On the server (SSR) there is no Worker / no wasm fetch, so `resolveMarks`
// runs inline with the JS core -- the same byte-identical result the browser
// worker produces, so there's no SSR/client divergence.

import type { Mark, ResolveInput } from "@essayist/core";
import { resolveMarks } from "@essayist/core";

let worker: Worker | null = null;
let nextId = 1;

interface MarksResponse {
  id: number;
  result: Mark[];
}

const pending = new Map<
  number,
  { resolve: (r: Mark[]) => void; reject: (e: unknown) => void }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<MarksResponse>) => {
    const { id, result } = e.data;
    const p = pending.get(id);
    if (p) {
      pending.delete(id);
      p.resolve(result);
    }
  };
  worker.onerror = (err) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker = null; // a later call will spin up a fresh worker
  };
  return worker;
}

export function resolveMarksViaWorker(
  marks: Mark[],
  oldContent: string,
  newContent: string,
): Promise<Mark[]> {
  // SSR: no Worker / wasm on the server -- run the sync JS-core `resolveMarks`
  // inline. The browser uses the worker below.
  if (typeof window === "undefined") {
    const input: ResolveInput = { marks, oldContent, newContent };
    return Promise.resolve(resolveMarks(input));
  }
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<Mark[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, marks, oldContent, newContent });
  });
}
