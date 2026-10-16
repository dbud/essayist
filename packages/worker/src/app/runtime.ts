import * as D1Client from "@effect/sql-d1/D1Client";
import {
  type AuthStore,
  jsonLogLayer,
  layerAuthD1,
  type PersistenceError,
  ReviewConfig,
  Workspaces,
} from "@essayist/core";
import { layerKvD1 } from "@essayist/core/kv_d1";
import { Effect, Layer, LogLevel, ManagedRuntime, References } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import type { WorkerEnv } from "#/env.ts";
import { Votes } from "#/votes/service.ts";

// The Persistence requirement is satisfied internally by the D1 layer.
type WorkerRuntime = ManagedRuntime.ManagedRuntime<
  Votes | ReviewConfig | Workspaces | AuthStore,
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
export function runtime(e: WorkerEnv): WorkerRuntime {
  return runtimeCache.getOrInsertComputed(e, ({ db }) =>
    ManagedRuntime.make(
      Layer.unwrap(
        Effect.gen(function* () {
          const client = yield* D1Client.make({ db: db });
          const storage = layerKvD1(client);
          return Layer.mergeAll(
            Layer.provide(
              Layer.mergeAll(
                Votes.layerMemory,
                ReviewConfig.layerNoDeps,
                jsonLogLayer,
                Layer.succeed(
                  References.MinimumLogLevel,
                  parseLogLevel(e.logLevel),
                ),
              ),
              storage,
            ),
            Layer.provide(Workspaces.layerNoDeps, storage),
            layerAuthD1(client),
          );
        }),
      ).pipe(Layer.provide(Reactivity.layer)),
    ),
  );
}
