import {
  ConfigStore,
  EventTraceStore,
  KvAdapter,
  ReviewStore,
  type User,
  UserStateStore,
  type Workspace,
  WorkspaceStore,
} from "@essayist/core";
import { seedDemo } from "@/seed.ts";

/**
 * Backing stores for the web app, over one shared `KvAdapter`.
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
export const userStateStore = new UserStateStore(adapter);
export const configStore = new ConfigStore(adapter);
export const reviewStore = new ReviewStore(adapter);
export const traceStore = new EventTraceStore(adapter);

/**
 * Dev-mode demo data (users + workspace + sample files), seeded idempotently on
 * boot via {@link seedDemo}. `undefined` outside dev; real auth/identity
 * replaces this later. IDs are stable across restarts once seeded.
 */
const demo = isDev ? await seedDemo(workspaceStore, adapter) : undefined;
export const demoUser: User | undefined = demo?.demoUser;
export const demoWorkspace: Workspace | undefined = demo?.demoWorkspace;
