import {
  jsonLogLayer,
  type PersistenceError,
  ReviewConfig,
} from "@essayist/core";
import { layerKvConnect } from "@essayist/core/kv_connect";
import {
  type Effect,
  Layer,
  LogLevel,
  ManagedRuntime,
  References,
} from "effect";
import type { WorkerEnv } from "#/env.ts";
import { Votes } from "#/votes/service.ts";

// The Persistence requirement is satisfied internally by the connect layer.
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

function build(env: WorkerEnv): WorkerRuntime {
  const url = env.kvRemoteUrl;
  const token = env.kvAccessToken;
  if (url === undefined || token === undefined) {
    throw new Error(
      "worker runtime: DENO_KV_REMOTE_URL and DENO_KV_ACCESS_TOKEN are required",
    );
  }
  return ManagedRuntime.make(
    Layer.provide(
      Layer.mergeAll(
        Votes.layerMemory,
        ReviewConfig.layerNoDeps,
        jsonLogLayer,
        Layer.succeed(References.MinimumLogLevel, parseLogLevel(env.logLevel)),
      ),
      layerKvConnect(url, token),
    ),
  );
}

const runtimeCache = new Map<WorkerEnv, WorkerRuntime>();

// One runtime per env snapshot; snapshots are stable per isolate, so the
// remote KV opens once per isolate.
export function workerRuntime(e: WorkerEnv): WorkerRuntime {
  return runtimeCache.getOrInsertComputed(e, build);
}

export async function runLoader<A>(
  self: Effect.Effect<A, PersistenceError, Votes | ReviewConfig>,
  e: WorkerEnv,
): Promise<A> {
  return workerRuntime(e).runPromise(self);
}
