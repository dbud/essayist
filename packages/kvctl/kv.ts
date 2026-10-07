// KV helpers shared by kvctl commands.

import { fileURLToPath } from "node:url";
import {
  ConfigStore,
  KvAdapter,
  Persistence,
  type PersistenceError,
  TraceEventStore,
  Workspaces,
} from "@essayist/core";
import { Layer, ManagedRuntime } from "effect";
import type { KvctlGlobals } from "@/globals.ts";

// The local playground KV, also used by the web dev server. Resolved from
// this module so the default works from any working directory.
export const LOCAL_KV = fileURLToPath(
  new URL("../web/local-kv.sqlite3", import.meta.url),
);

// The categories cache on a running instance watches this key; a bump makes
// every isolate drop its cache instead of waiting out the TTL.
export const CATEGORIES_EPOCH: Deno.KvKey = ["cache_epoch", "categories"];

interface KvCtx {
  kv: Deno.Kv;
  runtime: ManagedRuntime.ManagedRuntime<Workspaces, PersistenceError>;
  config: ConfigStore;
  traceStore: TraceEventStore;
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
  const adapter = new KvAdapter(kv);
  // The runtime opens its own handle to the same store, and closes it on
  // dispose, so the fn's promise does not outlive the CLI invocation.
  const runtime: ManagedRuntime.ManagedRuntime<Workspaces, PersistenceError> =
    ManagedRuntime.make(
      Layer.provide(
        Workspaces.layerNoDeps,
        Persistence.layerKv(resolveTarget(globals)),
      ),
    );
  try {
    return await fn({
      kv,
      runtime,
      config: new ConfigStore(adapter),
      traceStore: new TraceEventStore(adapter),
    });
  } finally {
    await runtime.dispose();
    kv.close();
  }
}
