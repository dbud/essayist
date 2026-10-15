/**
 * KV Connect instance of the {@linkcode Persistence} service: opens the npm
 * `@deno/kv` remote client (Deno Deploy, or any endpoint implementing KV
 * Connect) through {@linkcode layerKvHandle}. The connection closes when
 * the runtime disposes.
 */

import { openKv } from "@deno/kv";
import { Effect, type Layer } from "effect";
import { layerKvHandle } from "./kv_layer.ts";
import { PersistenceError } from "./mod.ts";
import type { Persistence } from "./service.ts";

export function layerKvConnect(
  baseUrl: string,
  accessToken?: string,
): Layer.Layer<Persistence, PersistenceError> {
  return layerKvHandle(
    Effect.tryPromise({
      try: () =>
        accessToken === undefined
          ? openKv(baseUrl)
          : openKv(baseUrl, { accessToken }),
      catch: (cause) => new PersistenceError({ cause }),
    }),
  );
}
