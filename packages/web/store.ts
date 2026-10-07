import {
  ConfigStore,
  KvAdapter,
  Persistence,
  ReviewStore,
  TraceEventStore,
  type User,
  UserState,
  type Workspace,
  WorkspaceStore,
} from "@essayist/core";
import { Layer, ManagedRuntime } from "effect";
import { seedDemo } from "@/seed.ts";

/**
 * Backing stores for the web app.
 *
 * Stores mid-migration to Effect live on a shared `KvAdapter`; migrated
 * ones are services behind one `ManagedRuntime`. UserState is on the
 * runtime; Workspace, Config, Review, and traces still use the adapter.
 *
 * On Deno Deploy, `Deno.openKv()` connects to the platform KV. In local dev
 * (`DENO_ENV=development`) it opens a project-relative SQLite file
 * (`local-kv.sqlite3`, gitignored).
 */
const isDev = Deno.env.get("DENO_ENV") === "development";

export const kv = isDev
  ? await Deno.openKv("./local-kv.sqlite3")
  : await Deno.openKv();

export const adapter = new KvAdapter(kv);
export const workspaceStore = new WorkspaceStore(adapter);
export const configStore = new ConfigStore(adapter);
export const reviewStore = new ReviewStore(adapter);
export const traceStore = new TraceEventStore(adapter);

/**
 * The Effect runtime for migrated stores. Runs for the isolate's lifetime;
 * there is no shutdown hook on Deno Deploy or the dev server, so disposal
 * happens with process exit. Failure typing reaches call sites as rejected
 * promises, so handler behavior is unchanged.
 */
export const runtime = ManagedRuntime.make(
  Layer.provide(UserState.layerNoDeps, Persistence.layerKv(kv)),
);

/**
 * Dev-mode demo data (users + workspace + sample files), seeded idempotently on
 * boot via {@link seedDemo}. `undefined` outside dev; real auth/identity
 * replaces this later. IDs are stable across restarts once seeded.
 */
const demo = isDev ? await seedDemo(workspaceStore, adapter) : undefined;
export const demoUser: User | undefined = demo?.demoUser;
export const demoWorkspace: Workspace | undefined = demo?.demoWorkspace;
