import type { Mark } from "@essayist/core";
import { resolveMarks } from "@essayist/core";

let worker: Worker | null = null;
let nextId = 1;

interface MarksResponse {
  id: number;
  result: Mark[];
}

let inFlight: {
  id: number;
  resolve: (r: Mark[]) => void;
  reject: (e: unknown) => void;
} | null = null;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<MarksResponse>) => {
    const { id, result } = e.data;
    if (inFlight?.id === id) {
      inFlight.resolve(result);
      inFlight = null;
    }
  };
  worker.onerror = (err) => {
    if (inFlight) {
      inFlight.reject(err);
      inFlight = null;
    }
    worker = null;
  };
  return worker;
}

function cancelInFlight(reason: unknown): void {
  inFlight?.reject(reason);
  inFlight = null;
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export function resolveMarksViaWorker(
  marks: Mark[],
  oldContent: string,
  newContent: string,
  signal?: AbortSignal,
): Promise<Mark[]> {
  if (typeof window === "undefined") {
    return Promise.resolve(resolveMarks({ marks, oldContent, newContent }));
  }

  // Only one request is in-flight at a time. The wasm `myers` call is a single
  // blocking native function, so cancelling it means terminating the worker.
  if (inFlight) cancelInFlight(abortError());
  if (signal?.aborted) return Promise.reject(abortError());

  const w = ensureWorker();
  const id = nextId++;
  return new Promise<Mark[]>((resolve, reject) => {
    inFlight = { id, resolve, reject };
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          // Only act if this request is still the one in-flight; otherwise it
          // already settled and there is nothing to do.
          if (inFlight?.id === id) cancelInFlight(abortError());
        },
        { once: true },
      );
    }
    w.postMessage({ id, marks, oldContent, newContent });
  });
}
