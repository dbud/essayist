/**
 * A supervised long-lived stream: reopens via `open()` when the iterator
 * ends or errors (with doubling, capped backoff), and reopens immediately
 * when `restart()` is requested (e.g. because the stream's input set
 * grew). Values are delivered to `onItem`; `onStart` lets the consumer
 * reset per-stream state before each open.
 */

import { delay } from "@/utils/delay.ts";

/** Delay before the first stream reconnect (doubling, capped). */
const RESTART_BACKOFF_MS = 1_000;
const RESTART_BACKOFF_CAP_MS = 30_000;

/** Race sentinel: the restart signal fired, not an iterator value. */
const RESTARTED = Symbol("supervisedStream: restarted");

/** A one-shot restart request: `trigger()` marks it fired and wakes the
 * stream waiting on `promise`. The flag survives the wait, so a request
 * landing while the stream is processing is not lost. */
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

/** The restart signal of the stream that is currently parked, replaced
 * before every run so `restart()` always reaches the live one. */
interface SupervisorState {
  signal?: RestartSignal;
}

export interface StreamHooks<T> {
  /** Log label for reconnect and error lines. */
  name: string;
  /** Open a fresh iterator; called after `onStart` on every run, so it
   * may read input state that changed since the last run. */
  open: () => AsyncIterator<T>;
  /** A stream is about to open: reset per-stream state here. */
  onStart: () => void;
  /** Process one item. */
  onItem: (item: T) => void;
}

export interface SupervisedStream {
  /** Reopen the stream immediately (e.g. its input set grew). A request
   * landing during the backoff window is absorbed by the pending
   * reconnect, which reads fresh input state anyway. */
  restart: () => void;
}

/** Start supervising a stream. Runs detached: failures are logged, not
 * thrown. */
export function supervise<T>(hooks: StreamHooks<T>): SupervisedStream {
  const state: SupervisorState = {};
  void loop(hooks, state);
  return { restart: () => state.signal?.trigger() };
}

async function loop<T>(
  hooks: StreamHooks<T>,
  state: SupervisorState,
): Promise<void> {
  let attempt = 0;
  for (;;) {
    // A fresh signal per run: a fired flag must never leak into the next
    // stream, or the next run would restart instantly, forever.
    const signal = restartSignal();
    state.signal = signal;
    const outcome = await runStream(hooks, signal);
    if (outcome !== "failed") attempt = 0;
    if (outcome === "restarted") continue;
    // The stream ended or errored: reconnect with backoff. Consumers'
    // own staleness bounds apply while the stream is down.
    await delay(
      Math.min(RESTART_BACKOFF_MS * 2 ** attempt, RESTART_BACKOFF_CAP_MS),
    );
    if (outcome === "failed") attempt++;
  }
}

/**
 * Run one stream until it is restarted (a restart was requested), ends,
 * or errors. "delivered" marks a run that processed at least one item,
 * which lets the retry policy treat a healthy stream's end differently
 * from a cold failure when backing off.
 */
async function runStream<T>(
  hooks: StreamHooks<T>,
  signal: RestartSignal,
): Promise<"restarted" | "delivered" | "failed"> {
  hooks.onStart();
  let delivered = false;
  try {
    const it = hooks.open();
    try {
      for await (const item of items(it, signal.promise)) {
        hooks.onItem(item);
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
