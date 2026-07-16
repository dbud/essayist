import type { User, Workspace } from "@essayist/core";
import { KvAdapter, WorkspaceStore } from "@essayist/core";
import { seedDemo } from "@/seed.ts";

/**
 * Shared backing store for the web app.
 *
 * On Deno Deploy, `Deno.openKv()` connects to the platform KV. In local dev
 * (`DENO_ENV=development`) it opens a project-relative SQLite file
 * (`local-kv.sqlite3`, gitignored) so the database is easy to find, inspect, and
 * reset.
 *
 * The {@link WorkspaceStore} and per-request `VirtualFileSystem` instances share
 * this one adapter, keyed under disjoint top-level parts (`users`, `workspaces`,
 * `members_*` for the store; `ws` for the VFS).
 */
const isDev = Deno.env.get("DENO_ENV") === "development";

const denoKv = isDev
  ? await Deno.openKv("./local-kv.sqlite3")
  : await Deno.openKv();

export const adapter = new KvAdapter(denoKv);
export const store = new WorkspaceStore(adapter);

/**
 * Dev-mode demo data (users + workspace + sample files), seeded idempotently on
 * boot via {@link seedDemo}. `undefined` outside dev; real auth/identity
 * replaces this later. IDs are stable across restarts once seeded.
 */
const demo = isDev ? await seedDemo(store, adapter) : undefined;
export const demoUser: User | undefined = demo?.demoUser;
export const demoUser2: User | undefined = demo?.demoUser2;
export const demoWorkspace: Workspace | undefined = demo?.demoWorkspace;

if (demo) {
  console.info(
    `[dev] users: ${demo.demoUser.id} (demo), ${demo.demoUser2.id} (demo2) | workspace: ${demo.demoWorkspace.id}`,
  );
}
