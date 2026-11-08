import { driveReviewRun, ReviewPacing, type RunRef } from "@essayist/core";
import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";

import { env } from "#/env.ts";
import { StreamHub } from "#/reviews/streamHub.ts";
import { runtime, type WorkerRuntime } from "#/runtime.ts";

const RUN_REF = "run";

/** DO storage through Effect; a storage fault dies per the worker convention, cause intact. */
const storageEffect = <A>(op: () => Promise<A>): Effect.Effect<A> =>
  Effect.tryPromise({ try: op, catch: (cause) => cause }).pipe(Effect.orDie);

const arm = (storage: DurableObjectStorage, at: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const armed = yield* storageEffect(() => storage.getAlarm());
    if (armed === null) {
      yield* storageEffect(() => storage.setAlarm(at));
    }
  });

export class ReviewRunDriver extends DurableObject {
  readonly #rt: WorkerRuntime;
  readonly #hub: StreamHub;

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    this.#rt = runtime(env(workerEnv));
    this.#hub = new StreamHub(this.#rt);
  }

  async wake(ref: RunRef): Promise<void> {
    const storage = this.ctx.storage;
    await this.#rt.runPromise(
      Effect.gen(function* () {
        yield* storageEffect(() => storage.put(RUN_REF, ref));
        yield* arm(storage, Date.now());
      }),
    );
  }

  /** A probe for the janitor and tests. */
  async alarmAt(): Promise<number | null> {
    return this.#rt.runPromise(storageEffect(() => this.ctx.storage.getAlarm()));
  }

  async stream(ref: RunRef, lastSeq: number): Promise<ReadableStream<Uint8Array>> {
    return this.#hub.stream(ref, lastSeq);
  }

  override async alarm(): Promise<void> {
    const storage = this.ctx.storage;
    await this.#rt.runPromise(
      Effect.gen({ self: this }, function* () {
        const { retryMs } = yield* ReviewPacing;
        const ref = yield* storageEffect(() => storage.get<RunRef>(RUN_REF));
        if (ref === undefined) {
          yield* storageEffect(() => storage.deleteAlarm());
          return;
        }
        // Arm before driving: a killed handler is re-driven by its pending alarm, and while a
        // handler runs, arm is a no-op, so drives stay single.
        yield* arm(storage, Date.now() + retryMs);
        const settled = yield* driveReviewRun(ref, this.#hub.observer()).pipe(
          Effect.tapCause((cause) => Effect.logError("review driver drive failed", cause)),
          Effect.catchCause(() => Effect.succeed(false)),
        );
        if (settled) yield* storageEffect(() => storage.deleteAlarm());
      }).pipe(Effect.tapCause((cause) => Effect.logError("review driver alarm failed", cause))),
    );
  }
}
