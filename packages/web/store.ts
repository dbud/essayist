import type { User, Workspace } from "@essayist/core";
import {
  InMemoryAdapter,
  VirtualFileSystem,
  WorkspaceStore,
} from "@essayist/core";
import { seedDemoFiles } from "@/seed.ts";

/**
 * Shared backing store for the web app. In production this adapter is backed by
 * Deno KV; here it is in-memory and reseeded on every startup.
 *
 * The {@link WorkspaceStore} and per-request `VirtualFileSystem` instances share
 * this one adapter, keyed under disjoint top-level parts (`users`, `workspaces`,
 * `members_*` for the store; `ws` for the VFS).
 */
export const adapter = new InMemoryAdapter();
export const store = new WorkspaceStore(adapter);

/**
 * Dev-mode seed: a demo user owns one demo workspace, plus a second demo user
 * for manual sharing tests (via the `X-User-Id` header). IDs are random per
 * restart; the client discovers the workspace id via `GET /api/workspaces`.
 * Real auth/identity (and real user creation) replaces this later.
 */
export const demoUser: User = await store.createUser(
  "demo@example.com",
  "Demo User",
);
export const demoUser2: User = await store.createUser(
  "demo2@example.com",
  "Demo User 2",
);
export const demoWorkspace: Workspace = await store.createWorkspace(
  "Demo",
  demoUser.id,
);

// Seed the demo workspace's VFS with sample files and marks.
const demoVfs = new VirtualFileSystem(adapter, demoWorkspace.id);
await seedDemoFiles(demoVfs);

// Surface the dev-mode ids so they can be used with `X-User-Id` for manual API
// testing (e.g. sharing the demo workspace with demoUser2).
console.info(
  `[dev] users: ${demoUser.id} (demo), ${demoUser2.id} (demo2) | workspace: ${demoWorkspace.id}`,
);
