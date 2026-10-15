// KV helpers shared by kvctl commands.

import { fileURLToPath } from "node:url";
import {
  ChunkedValues,
  type PersistenceError,
  ReviewConfig,
  TraceEvents,
  Workspaces,
} from "@essayist/core";
import { layerKv } from "@essayist/core/kv_layer";
import { Layer, ManagedRuntime } from "effect";
import type { KvctlGlobals } from "#/globals.ts";

// The local playground KV, also used by the web dev server. Resolved from
// this module so the default works from any working directory.
export const LOCAL_KV = fileURLToPath(
  new URL("../web/local-kv.sqlite3", import.meta.url),
);

// The categories cache on a running instance watches this key; a bump makes
// every isolate drop its cache instead of waiting out the TTL.
export const CATEGORIES_EPOCH: Deno.KvKey = ["cache_epoch", "categories"];

/** The services kvctl commands reach through the runtime. */
export type KvRuntime = ManagedRuntime.ManagedRuntime<
  Workspaces | ReviewConfig | TraceEvents | ChunkedValues,
  PersistenceError
>;

interface KvCtx {
  kv: Deno.Kv;
  runtime: KvRuntime;
}

export function resolveTarget(globals: KvctlGlobals): string {
  return (
    globals.target ??
    (globals.local ? LOCAL_KV : Deno.env.get("REMOTE_URL")) ??
    LOCAL_KV
  );
}

export async function withKv<T>(
  globals: KvctlGlobals,
  fn: (ctx: KvCtx) => Promise<T>,
): Promise<T> {
  const kv = await Deno.openKv(resolveTarget(globals));
  // The runtime opens its own handle to the same store, and closes it on
  // dispose, so the fn's promise does not outlive the CLI invocation.
  const runtime: KvRuntime = ManagedRuntime.make(
    Layer.provide(
      Layer.mergeAll(
        Workspaces.layerNoDeps,
        ReviewConfig.layerNoDeps,
        Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
        ChunkedValues.layerNoDeps,
      ),
      layerKv(resolveTarget(globals)),
    ),
  );
  try {
    return await fn({ kv, runtime });
  } finally {
    await runtime.dispose();
    kv.close();
  }
}
