import type { User, Workspace } from "@essayist/core";
import { InMemoryAdapter, WorkspaceStore } from "@essayist/core";

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
 * Dev-mode seed: one demo user owns one demo workspace. IDs are random per
 * restart; the client discovers the workspace id via `GET /api/workspaces` in a
 * later stage. Real auth/identity (and real user creation) replaces this later.
 */
export const demoUser: User = await store.createUser(
  "demo@example.com",
  "Demo User",
);
export const demoWorkspace: Workspace = await store.createWorkspace(
  "Demo",
  demoUser.id,
);
