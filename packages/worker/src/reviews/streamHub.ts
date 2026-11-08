import {
  ReviewRun,
  ReviewRuns,
  TraceEvents,
  WorkspaceId,
  type PersistenceError,
  type ReviewObserver,
  type RunRef,
  type TraceEvent,
} from "@essayist/core";
import { Effect, Fiber, Option, Queue, Schema, Semaphore } from "effect";

import type { WorkerRuntime } from "#/runtime.ts";

const KEEPALIVE_MS = 15_000;
const KEEPALIVE_TICKS = 120;

const frameEncoder = new TextEncoder();

/** Never emitted by frame builders; the drain closes its controller on seeing it. */
const CLOSE_FRAME = "\u0000";

interface Sink {
  readonly queue: Queue.Queue<string>;
  readonly drainFiber: Fiber.Fiber<void, PersistenceError>;
  readonly pingFiber: Fiber.Fiber<void, PersistenceError>;
}

export class StreamHub {
  #mutex = Semaphore.makeUnsafe(1);
  #sinks = new Map<number, Sink>();
  #nextSinkId = 1;

  constructor(private readonly rt: WorkerRuntime) {}

  /** Open a stream for the run: replay its trace past lastSeq, then live until the run settles,
   * the connection caps, or the client goes away. */
  async stream(ref: RunRef, lastSeq: number): Promise<ReadableStream<Uint8Array>> {
    const sinkId = this.#nextSinkId++;
    return new ReadableStream<Uint8Array>({
      start: (controller) =>
        this.rt.runPromise(
          this.#attach(sinkId, controller, ref, lastSeq).pipe(
            // A storage fault during attach leaves the stream hanging; drop the sink and close it.
            Effect.catchTag("PersistenceError", () =>
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
      onTrace: (event) => this.#publish(this.#traceFrame(event)),
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

  #doneFrame(run: ReviewRun): string {
    const encoded = Schema.encodeSync(ReviewRun)(run);
    return `event: done\ndata: ${JSON.stringify(encoded)}\n\n`;
  }

  /** Under the mutex, so replay and live frames land on each stream in seq order. */
  #publish(frame: string): Effect.Effect<void> {
    return this.#mutex.withPermits(1)(
      Effect.forEach(this.#sinks.values(), (sink) => Queue.offer(sink.queue, frame), {
        discard: true,
      }),
    );
  }

  /** Holds the mutex, so no live frame can interleave with the replay. */
  #attach(
    sinkId: number,
    controller: ReadableStreamDefaultController<Uint8Array>,
    { wsId, runId }: RunRef,
    lastSeq: number,
  ): Effect.Effect<void, PersistenceError, TraceEvents | ReviewRuns> {
    return this.#mutex.withPermits(1)(
      Effect.gen({ self: this }, function* () {
        const queue = yield* Queue.unbounded<string>();
        // Forked on the runtime's root scope, so the fibers outlive this program.
        const drainFiber = this.rt.runFork(this.#drain(queue, controller));
        const pingFiber = this.rt.runFork(this.#keepalive(queue));
        const sink: Sink = { queue, drainFiber, pingFiber };
        this.#sinks.set(sinkId, sink);

        const traces = yield* TraceEvents;
        const events = yield* Effect.provideService(traces.get(runId, lastSeq), WorkspaceId, {
          wsId,
        });
        for (const event of events) {
          yield* Queue.offer(sink.queue, this.#traceFrame(event));
        }

        const runs = yield* ReviewRuns;
        return yield* runs.getRun(runId).pipe(
          Effect.provideService(WorkspaceId, { wsId }),
          Effect.map(Option.some),
          Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(Option.none<ReviewRun>())),
          Effect.flatMap((run) =>
            Option.match(run, {
              onNone: () => Queue.offer(sink.queue, CLOSE_FRAME),
              onSome: (settled) =>
                settled.status === "running"
                  ? Effect.void
                  : Effect.andThen(
                      Queue.offer(sink.queue, this.#doneFrame(settled)),
                      Queue.offer(sink.queue, CLOSE_FRAME),
                    ),
            }),
          ),
        );
      }),
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
