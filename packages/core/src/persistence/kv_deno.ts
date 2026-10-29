// @ts-nocheck: this file is deno-world; its type authority is the deno
// check in CI (see DEVELOPMENT.md). The npm type checker has no Deno
// namespace, so a local check would only produce noise.

import type { Kv } from "@deno/kv";
import { Effect, type Layer } from "effect";

import { layerKvHandle } from "./kv_layer.ts";
import { PersistenceError } from "./mod.ts";
import type { Persistence } from "./service.ts";

/** A layer that opens its own connection, closing it when the runtime
 * disposes. Omit `path` for the platform KV; pass a file path for a local store, or `:memory:` for
 * an ephemeral one (tests). */
export function layerKv(path?: string): Layer.Layer<Persistence, PersistenceError> {
  return layerKvHandle(
    Effect.tryPromise({
      try: async () => (await Deno.openKv(path)) as unknown as Kv,
      catch: (cause) => new PersistenceError({ cause }),
    }),
  );
}
