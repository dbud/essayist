import * as D1Client from "@effect/sql-d1/D1Client";
import {
  type CoreServices,
  createStubModelClient,
  layerCoreD1,
  ModelClient,
  ReviewPacing,
} from "@essayist/core";
import { Effect, Layer, LogLevel, ManagedRuntime, References } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";

import { type GoogleConfig, googleConfigLayer, type WorkerEnv } from "#/env.ts";
import { logLayer } from "#/log.ts";
import { RunDrivers } from "#/reviews/runDrivers.ts";

export type WorkerServices = CoreServices | ReviewPacing | ModelClient | RunDrivers | GoogleConfig;

export type WorkerRuntime = ManagedRuntime.ManagedRuntime<WorkerServices, never>;

function parseLogLevel(raw: string | undefined) {
  const wanted = (raw ?? "info").toLowerCase();
  const level = LogLevel.values.find((candidate) => candidate.toLowerCase() === wanted);
  return level ?? "Info";
}

type RuntimeLayer = Layer.Layer<WorkerServices>;

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
        return Layer.mergeAll(
          layerCoreD1(client),
          Layer.succeed(
            ModelClient,
            createStubModelClient({
              delayMs: e.stubModelDelayMs,
              faultyProposals: e.stubModelFaults,
            }),
          ),
          RunDrivers.layerOf(e.runDriver),
          Layer.succeed(ReviewPacing, {
            heartbeatMs: e.driverHeartbeatMs,
            staleMs: e.driverStaleMs,
            retryMs: e.driverRetryMs,
          }),
          googleConfigLayer(e),
          logLayer,
          Layer.succeed(References.MinimumLogLevel, parseLogLevel(e.logLevel)),
        );
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
