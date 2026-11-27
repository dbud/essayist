import {
  feedTraceEvent,
  loadProgressFeed,
  ReviewRun,
  ReviewRuns,
  TraceEvents,
  WorkspaceId,
  type ProgressFeed,
  type ReviewConfig,
  type ReviewObserver,
  type RunRef,
  type TraceEvent,
} from "@essayist/core";
import { Effect, Fiber, Option, Queue, Schema, Semaphore } from "effect";

import type { ReviewStreamDetail } from "#/models/reviewRuns.data.ts";
import type { WorkerRuntime } from "#/runtime.ts";

const KEEPALIVE_MS = 15_000;
const KEEPALIVE_TICKS = 120;

const frameEncoder = new TextEncoder();

/** Never emitted by frame builders; the drain closes its controller on seeing it. */
const CLOSE_FRAME = "\u0000";

interface Sink {
  readonly detail: ReviewStreamDetail;
  readonly queue: Queue.Queue<string>;
  readonly drainFiber: Fiber.Fiber<void>;
  readonly pingFiber: Fiber.Fiber<void>;
}

export class StreamHub {
  #mutex = Semaphore.makeUnsafe(1);
  #sinks = new Map<number, Sink>();
  #nextSinkId = 1;
  #feed: ProgressFeed | undefined;

  constructor(private readonly rt: WorkerRuntime) {}

  /** Open a stream for the run. A trace stream first replays the trace past lastSeq; every stream
   * then gets a progress snapshot and live frames until the run settles, the connection caps, or
   * the client goes away. */
  async stream(
    ref: RunRef,
    lastSeq: number,
    detail: ReviewStreamDetail,
  ): Promise<ReadableStream<Uint8Array>> {
    const sinkId = this.#nextSinkId++;
    return new ReadableStream<Uint8Array>({
      start: (controller) =>
        this.rt.runPromise(
          this.#attach(sinkId, controller, ref, lastSeq, detail).pipe(
            // a defect during attach would leave the stream hanging; drop the sink and close it
            Effect.catchCause(() =>
              Effect.sync(() => {
                this.#sinks.delete(sinkId);
                controller.enqueue(frameEncoder.encode(CLOSE_FRAME));
              }),
            ),
          ),
        ),
      cancel: () => this.rt.runPromise(this.#cancelSink(sinkId)),
    });
  }

  /** The drive reports into the hub: frames reach attached streams, and a settle ends them. */
  observer(): ReviewObserver {
    return {
      onTrace: (event) => this.#onTrace(event),
      onSettled: (run) =>
        Effect.gen({ self: this }, function* () {
          yield* this.#publish(this.#doneFrame(run));
          yield* this.#closeSinks();
        }),
    };
  }

  #traceFrame(event: TraceEvent): string {
    return `event: trace\ndata: ${JSON.stringify(event)}\nid: ${event.seq}\n\n`;
  }

  #progressFrame({ progress, seq }: ProgressFeed): string {
    return `event: progress\ndata: ${JSON.stringify(progress)}\nid: ${seq}\n\n`;
  }

  #doneFrame(run: ReviewRun): string {
    const encoded = Schema.encodeSync(ReviewRun.json)(run);
    return `event: done\ndata: ${JSON.stringify(encoded)}\n\n`;
  }

  /** Under the mutex, so replay and live frames land on each stream in seq order. */
  #publish(frame: string): Effect.Effect<void> {
    return this.#mutex.withPermits(1)(this.#offerAll(frame));
  }

  /** Sends the trace frame, and a progress frame when the event changes the progress. */
  #onTrace(event: TraceEvent): Effect.Effect<void> {
    return this.#mutex.withPermits(1)(
      Effect.gen({ self: this }, function* () {
        yield* this.#offerAll(this.#traceFrame(event), "trace");
        if (this.#feed === undefined) return;
        const next = feedTraceEvent(this.#feed, event);
        if (next.progress !== this.#feed.progress) {
          yield* this.#offerAll(this.#progressFrame(next));
        }
        this.#feed = next;
      }),
    );
  }

  /** Callers hold the mutex. With `only`, the frame reaches only streams of that detail. */
  #offerAll(frame: string, only?: ReviewStreamDetail): Effect.Effect<void> {
    const sinks = this.#sinks.values().filter((sink) => only === undefined || sink.detail === only);
    return Effect.forEach(sinks, (sink) => Queue.offer(sink.queue, frame), { discard: true });
  }

  /** Holds the mutex, so no live frame can interleave with the replay. */
  #attach(
    sinkId: number,
    controller: ReadableStreamDefaultController<Uint8Array>,
    { wsId, runId }: RunRef,
    lastSeq: number,
    detail: ReviewStreamDetail,
  ): Effect.Effect<void, never, TraceEvents | ReviewRuns | ReviewConfig> {
    return this.#mutex.withPermits(1)(
      Effect.gen({ self: this }, function* () {
        const queue = yield* Queue.unbounded<string>();
        // Forked on the runtime's root scope, so the fibers outlive this program.
        const drainFiber = this.rt.runFork(this.#drain(queue, controller));
        const pingFiber = this.rt.runFork(this.#keepalive(queue));
        const sink: Sink = { detail, queue, drainFiber, pingFiber };
        this.#sinks.set(sinkId, sink);

        if (detail === "trace") {
          const traces = yield* TraceEvents;
          const events = yield* traces.get(runId, lastSeq);
          for (const event of events) {
            yield* Queue.offer(sink.queue, this.#traceFrame(event));
          }
        }

        const runs = yield* ReviewRuns;
        const run = yield* runs.getRun(runId).pipe(
          Effect.map(Option.some),
          Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(Option.none<ReviewRun>())),
        );
        if (Option.isNone(run)) {
          yield* Queue.offer(sink.queue, CLOSE_FRAME);
          return;
        }

        this.#feed ??= yield* loadProgressFeed(run.value);
        yield* Queue.offer(sink.queue, this.#progressFrame(this.#feed));
        if (run.value.status !== "running") {
          yield* Queue.offer(sink.queue, this.#doneFrame(run.value));
          yield* Queue.offer(sink.queue, CLOSE_FRAME);
        }
      }).pipe(Effect.provideService(WorkspaceId, { wsId })),
    );
  }

  /** Runs after the done frame, so streams end only after it. */
  #closeSinks(): Effect.Effect<void> {
    return this.#mutex.withPermits(1)(
      Effect.gen({ self: this }, function* () {
        const sinks = [...this.#sinks.values()];
        this.#sinks.clear();
        for (const sink of sinks) {
          yield* Fiber.interrupt(sink.pingFiber);
          yield* Queue.offer(sink.queue, CLOSE_FRAME);
        }
      }),
    );
  }

  #cancelSink(sinkId: number): Effect.Effect<void> {
    return Effect.gen({ self: this }, function* () {
      const sink = this.#sinks.get(sinkId);
      if (sink === undefined) return;
      this.#sinks.delete(sinkId);
      yield* Fiber.interrupt(sink.pingFiber);
      yield* Fiber.interrupt(sink.drainFiber);
    });
  }

  // The connection cap: after the last ping, the sink closes and the browser reattaches.
  #keepalive(queue: Queue.Queue<string>): Effect.Effect<void> {
    return Effect.gen(function* () {
      for (let tick = 0; tick < KEEPALIVE_TICKS; tick++) {
        yield* Effect.sleep(KEEPALIVE_MS);
        yield* Queue.offer(queue, ": ping\n\n");
      }
      yield* Queue.offer(queue, CLOSE_FRAME);
    });
  }

  #drain(queue: Queue.Queue<string>, controller: ReadableStreamDefaultController<Uint8Array>) {
    return Effect.gen(function* () {
      while (true) {
        const frame = yield* Queue.take(queue);
        if (frame === CLOSE_FRAME) {
          controller.close();
          return;
        }
        controller.enqueue(frameEncoder.encode(frame));
      }
    });
  }
}
