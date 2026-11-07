import type { PersistenceError } from "@essayist/core";
import { Effect } from "effect";

import { env } from "#/env.ts";
import { janitorJob } from "#/reviews/janitor.ts";
import { runtime, type WorkerServices } from "#/runtime.ts";

type ScheduledJob = Effect.Effect<void, PersistenceError, WorkerServices>;

/** Jobs run on every cron tick, in order; a failing job logs and waits for the next tick. */
const jobs: ReadonlyArray<ScheduledJob> = [janitorJob];

export function scheduled(
  _controller: ScheduledController,
  workerEnv: Cloudflare.Env,
): Promise<void> {
  return runtime(env(workerEnv)).runPromise(
    Effect.forEach(
      jobs,
      (job) =>
        Effect.catchCause(job, (cause) => Effect.logError("a scheduled job failed", { cause })),
      { discard: true },
    ),
  );
}
