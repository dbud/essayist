import * as D1 from "@effect/sql-d1/D1Client";
import {
  jsonLogLayer,
  type PersistenceError,
  ReviewConfig,
} from "@essayist/core";
import { layerKvD1 } from "@essayist/core/kv_d1";
import { Effect, Layer, LogLevel, ManagedRuntime, References } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import type { WorkerEnv } from "#/env.ts";
import { Votes } from "#/votes/service.ts";

// The Persistence requirement is satisfied internally by the D1 layer.
type WorkerRuntime = ManagedRuntime.ManagedRuntime<
  Votes | ReviewConfig,
  PersistenceError
>;

function parseLogLevel(raw: string | undefined) {
  const wanted = (raw ?? "info").toLowerCase();
  const level = LogLevel.values.find(
    (candidate) => candidate.toLowerCase() === wanted,
  );
  return level ?? "Info";
}

const runtimeCache = new Map<WorkerEnv, WorkerRuntime>();

// One runtime per env snapshot; snapshots are stable per isolate, so the
// D1 client builds once per isolate.
export function workerRuntime(e: WorkerEnv): WorkerRuntime {
  return runtimeCache.getOrInsertComputed(e, ({ db }) =>
    ManagedRuntime.make(
      Layer.provide(
        Layer.mergeAll(
          Votes.layerMemory,
          ReviewConfig.layerNoDeps,
          jsonLogLayer,
          Layer.succeed(References.MinimumLogLevel, parseLogLevel(e.logLevel)),
        ),
        Layer.unwrap(Effect.map(D1.make({ db }), layerKvD1)).pipe(
          Layer.provide(Reactivity.layer),
        ),
      ),
    ),
  );
}

export async function runLoader<A>(
  self: Effect.Effect<A, PersistenceError, Votes | ReviewConfig>,
  e: WorkerEnv,
): Promise<A> {
  return workerRuntime(e).runPromise(self);
}
