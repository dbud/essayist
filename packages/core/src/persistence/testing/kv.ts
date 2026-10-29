/** Test helpers for the services over persistence. */

import { openKv } from "@deno/kv";
import { Effect, Layer } from "effect";

import { jsonLogLayer } from "#/log.ts";
import { layerKvHandle } from "#/persistence/kv_layer.ts";
import { type Persistence, PersistenceError } from "#/persistence/mod.ts";

/** An ephemeral in-memory Persistence layer that owns its connection and
 * closes it when the layer disposes. The Node twin of `kv_deno.ts`'s `layerKv` (which opens via
 * `Deno.openKv`). */
export function layerKvMemory(): Layer.Layer<Persistence, PersistenceError> {
  return layerKvHandle(
    Effect.tryPromise({
      try: () => openKv(),
      catch: (cause) => new PersistenceError({ cause }),
    }),
  );
}

/**
 * The test layer for a service that requires Persistence: composes the service with a fresh
 * ephemeral KV per call, closed when the program's layers release, and the JSON-line logger as
 * in production.
 */
export function testLayer<S>(
  service: Layer.Layer<S, never, Persistence>,
): Layer.Layer<S, PersistenceError> {
  return Layer.provide(service, Layer.mergeAll(layerKvMemory(), jsonLogLayer));
}
