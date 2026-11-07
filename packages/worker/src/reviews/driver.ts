/**
 * The review run driver as a Durable Object. Every alarm invocation arms a backup beat before any
 * long await, so a driver killed mid-await is re-driven by its pending alarm.
 */

import { driveReviewRun, type DriveServices, ReviewPacing, type RunRef } from "@essayist/core";
import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";

import { env } from "#/env.ts";
import { runtime, type WorkerRuntime } from "#/runtime.ts";

const RUN_REF = "run";

/** DO storage through Effect; a storage fault dies per the worker convention, cause intact. */
const storageEffect = <A>(op: () => Promise<A>): Effect.Effect<A> =>
  Effect.tryPromise({ try: op, catch: (cause) => cause }).pipe(Effect.orDie);

/** No-op when an alarm is already armed. */
const arm = (storage: DurableObjectStorage, at: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    const armed = yield* storageEffect(() => storage.getAlarm());
    if (armed === null) {
      yield* storageEffect(() => storage.setAlarm(at));
    }
  });

/** A failed drive keeps the armed beat; a died beat hands the alarm back to the platform. */
function beat(
  storage: DurableObjectStorage,
): Effect.Effect<boolean, never, DriveServices | ReviewPacing> {
  return Effect.gen(function* () {
    const { retryMs } = yield* ReviewPacing;
    const ref = yield* storageEffect(() => storage.get<RunRef>(RUN_REF));
    if (ref === undefined) {
      yield* storageEffect(() => storage.deleteAlarm());
      return true;
    }
    // While a handler runs, a re-armed alarm stays pending behind it, so beats stay single.
    yield* arm(storage, Date.now() + retryMs);
    const settled = yield* driveReviewRun(ref).pipe(
      Effect.tapCause((cause) => Effect.logError("review driver drive failed", cause)),
      Effect.catchCause(() => Effect.succeed(false)),
    );
    if (settled) yield* storageEffect(() => storage.deleteAlarm());
    return settled;
  }).pipe(Effect.tapCause((cause) => Effect.logError("review driver alarm beat failed", cause)));
}

export class ReviewRunDriver extends DurableObject {
  readonly rt: WorkerRuntime;

  constructor(ctx: DurableObjectState, workerEnv: Cloudflare.Env) {
    super(ctx, workerEnv);
    this.rt = runtime(env(workerEnv));
  }

  /** Store the run ref and arm the first beat. */
  async start(ref: RunRef): Promise<void> {
    const storage = this.ctx.storage;
    await this.rt.runPromise(
      Effect.gen(function* () {
        yield* storageEffect(() => storage.put(RUN_REF, ref));
        yield* arm(storage, Date.now());
      }),
    );
  }

  /** A janitor-cron nudge. */
  async nudge(): Promise<void> {
    await this.rt.runPromise(arm(this.ctx.storage, Date.now()));
  }

  /** A probe for the janitor and tests. */
  async alarmAt(): Promise<number | null> {
    return this.rt.runPromise(storageEffect(() => this.ctx.storage.getAlarm()));
  }

  /** One drive beat: drive the run once; clear the alarm when it settles or the run is gone. */
  override async alarm(): Promise<void> {
    await this.rt.runPromise(beat(this.ctx.storage));
  }
}
