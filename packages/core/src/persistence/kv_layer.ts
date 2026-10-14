// @ts-nocheck: this file is deno-world; its type authority is the deno
// check in CI (see DEVELOPMENT.md). The npm type checker has no Deno
// namespace, so a local check would only produce noise.
/**
 * Deno-facing entry points for the {@linkcode Persistence} KV layer. The
 * runtime-neutral implementation lives in `kv_layer_compat.ts`, typed
 * against the npm `@deno/kv` client; this file casts the native `Deno.Kv`
 * handle once so web and kvctl call sites stay untouched.
 */

import type { Kv } from "@deno/kv";
import { Effect, Layer } from "effect";
import { kvLayerCompat } from "./kv_layer_compat.ts";
import { PersistenceError } from "./mod.ts";
import type { Persistence } from "./service.ts";

/** A native `Deno.Kv` handle meets the `@deno/kv` interface at runtime; the
 * libraries type the missing-key entry of `get` differently, so the boundary
 * casts once here and call sites stay untouched. */
export function kvLayer(kv: Deno.Kv): Layer.Layer<Persistence> {
  return kvLayerCompat(kv as unknown as Kv);
}

/** A layer that opens its own connection, closing it when the runtime
 * disposes. Omit `path` for the platform KV; pass a file path for a
 * local store, or `:memory:` for an ephemeral one (tests). */
export function layerKv(
  path?: string,
): Layer.Layer<Persistence, PersistenceError> {
  return Layer.unwrap(
    Effect.map(
      Effect.acquireRelease(
        Effect.tryPromise({
          try: () => Deno.openKv(path),
          catch: (cause) => new PersistenceError({ cause }),
        }),
        (kv) => Effect.sync(() => kv.close()),
      ),
      kvLayer,
    ),
  );
}
