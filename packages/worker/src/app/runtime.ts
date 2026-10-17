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

const bootLayer = (
  e: WorkerEnv,
): Layer.Layer<
  Votes | ReviewConfig | Workspaces | AuthStore,
  PersistenceError
> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const client = yield* D1Client.make({ db: e.db });
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
  ).pipe(Layer.provide(Reactivity.layer));

type RuntimeLayer = Layer.Layer<
  Votes | ReviewConfig | Workspaces | AuthStore,
  PersistenceError
>;

interface RuntimeCell {
  readonly layer: RuntimeLayer;
  readonly runtime: WorkerRuntime;
}

const cells = new Map<WorkerEnv, RuntimeCell>();

// One cell per env snapshot; snapshots are stable per isolate, so the D1
// client builds once per isolate.
function cell(e: WorkerEnv): RuntimeCell {
  return cells.getOrInsertComputed(e, (e) => {
    const layer = bootLayer(e);
    return { layer, runtime: ManagedRuntime.make(layer) };
  });
}

// The api tier shares the same layer as the runtime, joining its memo map.
export function runtimeLayer(e: WorkerEnv): RuntimeLayer {
  return cell(e).layer;
}

export function runtime(e: WorkerEnv): WorkerRuntime {
  return cell(e).runtime;
}
