/**
 * A single-flight worker client.
 *
 * At most one request is in-flight to the worker at a time. Dispatching while a
 * request is in-flight, or aborting it, terminates the worker -- the only way
 * to abandon a long synchronous call (e.g. a blocking wasm function) running on
 * it -- and spins up a fresh worker for the new request. A worker is only
 * re-created when a request is actually cancelled; otherwise it is reused.
 *
 * Requests are tagged with an `id`; the worker must post back
 * `{ id, result }` so responses can be matched (and stale ones ignored).
 */

export interface WorkerClient<TParams, TResponse> {
  dispatch: (params: TParams, signal?: AbortSignal) => Promise<TResponse>;
  terminate: () => void;
}

interface WorkerResponse<T> {
  id: number;
  result: T;
}

interface InFlight<T> {
  id: number;
  resolve: (r: T) => void;
  reject: (e: unknown) => void;
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function createWorkerClient<TParams extends object, TResponse>(
  createWorker: () => Worker,
): WorkerClient<TParams, TResponse> {
  let worker: Worker | null = null;
  let nextId = 1;
  let inFlight: InFlight<TResponse> | null = null;

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = createWorker();
    worker.onmessage = (e: MessageEvent<WorkerResponse<TResponse>>) => {
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

  function dispatch(params: TParams, signal?: AbortSignal): Promise<TResponse> {
    if (inFlight) cancelInFlight(abortError());
    if (signal?.aborted) return Promise.reject(abortError());

    const w = ensureWorker();
    const id = nextId++;
    return new Promise<TResponse>((resolve, reject) => {
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
      w.postMessage({ id, ...params });
    });
  }

  return { dispatch, terminate: () => cancelInFlight(abortError()) };
}
