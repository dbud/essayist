import {
  ChunkedValues,
  Files,
  jsonLogLayer,
  Marks,
  type PersistenceError,
  ReviewConfig,
  ReviewRuns,
  Search,
  TraceEvents,
  type User,
  UserState,
  type Workspace,
  Workspaces,
} from "@essayist/core";
import { layerKv } from "@essayist/core/kv_layer";
import { Layer, ManagedRuntime } from "effect";
import { env } from "@/env.ts";
import { seedDemo } from "@/seed.ts";

/**
 * Backing stores for the web app.
 *
 * Migrated stores are services behind one `ManagedRuntime`; the raw `kv`
 * handle remains for the dev seed sentinel only. On Deno Deploy,
 * `Deno.openKv()` connects to the platform KV. In local dev
 * (`DENO_ENV=development`) it opens a project-relative SQLite file
 * (`local-kv.sqlite3`, gitignored).
 */
const isDev = env.isDev;

export const kv = isDev
  ? await Deno.openKv("./local-kv.sqlite3")
  : await Deno.openKv();

/** The runtime's service environment, for call sites that pass it on. */
export type Runtime = ManagedRuntime.ManagedRuntime<
  | UserState
  | Workspaces
  | ReviewConfig
  | ReviewRuns
  | TraceEvents
  | Files
  | Marks
  | Search,
  PersistenceError
>;

/**
 * The Effect runtime for migrated stores. Its layers open their own KV
 * connections (the same file in dev as the raw `kv` handle above; multiple
 * connections to one store are safe) and close them when the runtime
 * disposes, which happens with process exit; there is no shutdown hook on
 * Deno Deploy or the dev server. Failure typing reaches call sites as
 * rejected promises, so handler behavior is unchanged.
 */
export const runtime: Runtime = ManagedRuntime.make(
  Layer.provide(
    Layer.mergeAll(
      UserState.layerNoDeps,
      Workspaces.layerNoDeps,
      ReviewConfig.layerNoDeps,
      ReviewRuns.layerNoDeps,
      Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
      ChunkedValues.layerNoDeps,
      Files.layerNoDeps,
      Layer.provide(Marks.layerNoDeps, Files.layerNoDeps),
      Layer.provide(Search.layerNoDeps, Files.layerNoDeps),
      jsonLogLayer,
    ),
    layerKv(isDev ? "./local-kv.sqlite3" : undefined),
  ),
);

/**
 * Dev-mode demo data (users + workspace + sample files), seeded idempotently on
 * boot via {@link seedDemo}. `undefined` outside dev; real auth/identity
 * replaces this later. IDs are stable across restarts once seeded.
 */
const demo = isDev ? await seedDemo(runtime, kv) : undefined;
export const demoUser: User | undefined = demo?.demoUser;
export const demoWorkspace: Workspace | undefined = demo?.demoWorkspace;
