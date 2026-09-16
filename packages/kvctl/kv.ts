// KV helpers shared by kvctl commands.

import { fileURLToPath } from "node:url";
import { ConfigStore, KvAdapter, WorkspaceStore } from "@essayist/core";
import type { KvctlGlobals } from "@/globals.ts";

// The local playground KV, the web dev server's KV. Resolved from this
// module so the default works from any working directory.
export const LOCAL_KV = fileURLToPath(
  new URL("../web/local-kv.sqlite3", import.meta.url),
);

// The categories cache on a running instance watches this key; a bump makes
// every isolate drop its cache instead of waiting out the TTL.
export const CATEGORIES_EPOCH: Deno.KvKey = ["cache_epoch", "categories"];

interface KvCtx {
  kv: Deno.Kv;
  workspaceStore: WorkspaceStore;
  config: ConfigStore;
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
  try {
    return await fn({
      kv,
      workspaceStore: new WorkspaceStore(adapter),
      config: new ConfigStore(adapter),
    });
  } finally {
    kv.close();
  }
}
