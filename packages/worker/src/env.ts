// The worker environment: Effect Config over the fetch handler's Cloudflare
// bindings (workerd exposes no process.env at module scope). The first
// request composes the provider and memoizes the snapshot per isolate; vite
// feeds the same keys via .dev.vars locally.

import { Config, ConfigProvider, Effect, Option } from "effect";

const optional = (name: string) => Config.option(Config.String(name));

const config = Config.all({
  LOG_LEVEL: optional("LOG_LEVEL"),
  DENO_KV_REMOTE_URL: optional("DENO_KV_REMOTE_URL"),
  DENO_KV_ACCESS_TOKEN: optional("DENO_KV_ACCESS_TOKEN"),
});

export interface WorkerEnv {
  readonly logLevel: string | undefined;
  readonly kvRemoteUrl: string | undefined;
  readonly kvAccessToken: string | undefined;
}

let cached: WorkerEnv | undefined;

export function env(bindings: unknown): WorkerEnv {
  if (cached !== undefined) return cached;

  const snapshot = Effect.runSync(
    config.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(bindings),
      ),
    ),
  );

  // One boot log of which variables were present; values never leave this
  // module. Console here: the runtime's json logger composes later.
  Effect.runSync(
    Effect.logInfo("worker environment loaded", {
      present: Object.entries(snapshot)
        .filter(([, option]) => option._tag === "Some")
        .map(([name]) => name),
    }),
  );

  cached = {
    logLevel: Option.getOrUndefined(snapshot.LOG_LEVEL),
    kvRemoteUrl: Option.getOrUndefined(snapshot.DENO_KV_REMOTE_URL),
    kvAccessToken: Option.getOrUndefined(snapshot.DENO_KV_ACCESS_TOKEN),
  };
  return cached;
}
