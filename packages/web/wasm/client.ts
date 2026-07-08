let worker: Worker | null = null;
let nextId = 1;

interface SortResponse {
  id: number;
  result: Int32Array;
}

const pending = new Map<
  number,
  { resolve: (r: Int32Array) => void; reject: (e: unknown) => void }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<SortResponse>) => {
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

export function sortInts(arr: Int32Array): Promise<Int32Array> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<Int32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, arr }, [arr.buffer]);
  });
}
