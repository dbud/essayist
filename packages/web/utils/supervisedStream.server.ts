/**
 * A supervised long-lived stream: reopens via `open()` when the iterator
 * ends or errors (with doubling, capped backoff), and reopens immediately
 * when `restart()` is requested (e.g. because the stream's input set
 * grew). Each value from the stream is delivered to `onItem` together
 * with the per-run state that `start` creates before each open.
 */

import { delay } from "@/utils/delay.ts";

/** Delay before the first stream reconnect (doubling, capped). */
const RESTART_BACKOFF_MS = 1_000;
const RESTART_BACKOFF_CAP_MS = 30_000;

/** Settles when the restart signal fires, instead of the iterator
 * delivering a value. */
const RESTARTED = Symbol("supervisedStream: restarted");

/** A one-shot restart request: `trigger()` marks it fired and wakes the
 * stream waiting on `promise`. The flag survives the wait, so a request
 * arriving while the stream is busy is not lost. */
interface RestartSignal {
  promise: Promise<typeof RESTARTED>;
  trigger: () => void;
  fired: boolean;
}

function restartSignal(): RestartSignal {
  let trigger: (value: typeof RESTARTED) => void = () => RESTARTED;
  const promise = new Promise<typeof RESTARTED>((r) => (trigger = r));
  const signal: RestartSignal = { promise, trigger: () => {}, fired: false };
  signal.trigger = () => {
    if (!signal.fired) {
      signal.fired = true;
      trigger(RESTARTED);
    }
  };
  return signal;
}

/** The restart signal of the run that is currently waiting, replaced
 * before every run so `restart()` always reaches the live one. */
interface SupervisorState {
  signal?: RestartSignal;
}

export interface StreamHooks<T, S> {
  /** Log label for reconnect and error lines. */
  name: string;
  /** Create the per-run state; called before every open. */
  start: () => S;
  /** Open a fresh iterator for this run, so it may read input state
   * that changed since the last run. */
  open: (state: S) => AsyncIterator<T>;
  /** Process one item for this run. */
  onItem: (item: T, state: S) => void;
}

export interface SupervisedStream {
  /** Reopen the stream immediately (e.g. its input set grew). If it
   * arrives while the stream is waiting out a backoff, the reconnect
   * that follows reads fresh input state anyway. */
  restart: () => void;
}

/** Start supervising a stream. The loop runs for the lifetime of the
 * caller; failures are logged, not thrown. */
export function supervise<T, S>(hooks: StreamHooks<T, S>): SupervisedStream {
  const state: SupervisorState = {};
  void loop(hooks, state);
  return { restart: () => state.signal?.trigger() };
}

async function loop<T, S>(
  hooks: StreamHooks<T, S>,
  state: SupervisorState,
): Promise<void> {
  let attempt = 0;
  for (;;) {
    // Each run gets its own signal, so a fired flag never carries over.
    state.signal = restartSignal();
    const run = hooks.start();
    const outcome = await runStream(hooks, state.signal, run);
    if (outcome !== "failed") attempt = 0;
    if (outcome === "restarted") continue;
    // The stream ended or errored: reconnect with backoff. Consumers
    // handle their own freshness (for example, a TTL) while the stream
    // is down.
    await delay(
      Math.min(RESTART_BACKOFF_MS * 2 ** attempt, RESTART_BACKOFF_CAP_MS),
    );
    if (outcome === "failed") attempt++;
  }
}

/**
 * Run one stream until it is restarted (a restart was requested), ends,
 * or errors. "delivered" marks a run that processed at least one item,
 * which lets the retry policy treat the end of a healthy stream
 * differently from a stream that died before delivering anything.
 */
async function runStream<T, S>(
  hooks: StreamHooks<T, S>,
  signal: RestartSignal,
  run: S,
): Promise<"restarted" | "delivered" | "failed"> {
  let delivered = false;
  try {
    const it = hooks.open(run);
    try {
      for await (const item of items(it, signal.promise)) {
        hooks.onItem(item, run);
        delivered = true;
      }
    } finally {
      await it.return?.();
    }
  } catch (err) {
    console.error(`${hooks.name}: stream failed`, err);
  }
  return signal.fired ? "restarted" : delivered ? "delivered" : "failed";
}

/**
 * Yield values until the stream ends or the restart signal fires. Once a
 * run ends by restart, its pending wait is dropped and errors from it are
 * ignored: the replacement stream takes over.
 */
async function* items<T>(
  it: AsyncIterator<T>,
  restart: Promise<typeof RESTARTED>,
): AsyncGenerator<T, void, unknown> {
  for (;;) {
    const next = it.next();
    void next.catch(() => {});
    const winner = await Promise.race([next, restart]);
    if (winner === RESTARTED) return;
    if (winner.done) return;
    yield winner.value;
  }
}
