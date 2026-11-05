import * as D1Client from "@effect/sql-d1/D1Client";
import {
  type AuthStore,
  ChunkedValues,
  createStubModelClient,
  Files,
  jsonLogLayer,
  layerAuthD1,
  Marks,
  ModelClient,
  type PersistenceError,
  ReviewConfig,
  ReviewPacing,
  ReviewRuns,
  TraceEvents,
  UserState,
  Workspaces,
} from "@essayist/core";
import { layerKvD1 } from "@essayist/core/kv_d1";
import { Effect, Layer, LogLevel, ManagedRuntime, References } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";

import { type GoogleConfig, googleConfigLayer, type WorkerEnv } from "#/env.ts";
import { RunDrivers } from "#/reviews/runDrivers.ts";

export type WorkerRuntime = ManagedRuntime.ManagedRuntime<
  | ReviewConfig
  | ReviewRuns
  | ReviewPacing
  | TraceEvents
  | Marks
  | Workspaces
  | AuthStore
  | UserState
  | Files
  | ModelClient
  | RunDrivers
  | GoogleConfig,
  PersistenceError
>;

function parseLogLevel(raw: string | undefined) {
  const wanted = (raw ?? "info").toLowerCase();
  const level = LogLevel.values.find((candidate) => candidate.toLowerCase() === wanted);
  return level ?? "Info";
}

type RuntimeLayer = Layer.Layer<
  | ReviewConfig
  | ReviewRuns
  | ReviewPacing
  | TraceEvents
  | Marks
  | Workspaces
  | AuthStore
  | UserState
  | Files
  | ModelClient
  | RunDrivers
  | GoogleConfig,
  PersistenceError
>;

interface RuntimeCell {
  readonly layer: RuntimeLayer;
  readonly runtime: WorkerRuntime;
}

const cells = new Map<WorkerEnv, RuntimeCell>();

// One cell per env snapshot. env() memoizes the snapshot per isolate, so a cell builds once per
// isolate: its layer, its runtime, and the D1 client inside the layer.
function cell(env: WorkerEnv): RuntimeCell {
  return cells.getOrInsertComputed(env, (e) => {
    const layer: RuntimeLayer = Layer.unwrap(
      Effect.gen(function* () {
        const client = yield* D1Client.make({ db: e.db });
        const storage = layerKvD1(client);
        return Layer.mergeAll(
          ReviewConfig.layerNoDeps,
          UserState.layerNoDeps,
          Files.layerNoDeps,
          Workspaces.layerNoDeps,
          ReviewRuns.layerNoDeps,
          Layer.succeed(
            ModelClient,
            createStubModelClient({
              delayMs: e.stubModelDelayMs,
              faultyProposals: e.stubModelFaults,
            }),
          ),
          RunDrivers.layerOf(e.runDriver),
          Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
          ChunkedValues.layerNoDeps,
          Layer.provide(Marks.layerNoDeps, Files.layerNoDeps),
          Layer.succeed(ReviewPacing, {
            heartbeatMs: e.driverHeartbeatMs,
            staleMs: e.driverStaleMs,
            retryMs: e.driverRetryMs,
          }),
          layerAuthD1(client),
          googleConfigLayer(e),
          jsonLogLayer,
          Layer.succeed(References.MinimumLogLevel, parseLogLevel(e.logLevel)),
        ).pipe(Layer.provide(storage));
      }),
    ).pipe(Layer.provide(Reactivity.layer));
    return { layer, runtime: ManagedRuntime.make(layer) };
  });
}

export function runtimeLayer(e: WorkerEnv): RuntimeLayer {
  return cell(e).layer;
}

export function runtime(e: WorkerEnv): WorkerRuntime {
  return cell(e).runtime;
}
