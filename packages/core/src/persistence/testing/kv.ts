/** Test helpers for the services over persistence. */

import { Layer } from "effect";
import { Persistence, type PersistenceError } from "@/persistence/mod.ts";

/**
 * The test layer for a service that requires Persistence: composes the
 * service with a fresh ephemeral KV per call, closed when the program's
 * layers release.
 */
export function testLayer<S>(
  service: Layer.Layer<S, never, Persistence>,
): Layer.Layer<S, PersistenceError> {
  return Layer.provide(service, Persistence.layerKv(":memory:"));
}
