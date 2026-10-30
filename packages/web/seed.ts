import type { User, Workspace, Workspaces } from "@essayist/core";
import { seedDemoFiles as seedDemoFilesEffect } from "@essayist/core";
import type { RunScoped } from "#/run.ts";
import { runScoped } from "#/run.ts";
import type { Runtime } from "#/store.ts";

/** Seed the given workspace's files with a sample essay and marks
 * exercising every category label; the content and its Effect live in
 * core's demo module. */
export async function seedDemoFiles(run: RunScoped): Promise<void> {
  await run(seedDemoFilesEffect());
}

/** Sentinel key marking that the demo seed has already been applied. */
const SEED_SENTINEL = ["__seeded", "demo"] as const;

export interface DemoData {
  demoUser: User;
  demoWorkspace: Workspace;
}

/**
 * Idempotently seed demo users, a demo workspace, and sample files for local
 * development. If the sentinel key is already set (a previous boot seeded), the
 * existing demo entities are loaded and returned without re-creating, so demo
 * IDs stay stable across restarts.
 *
 * Reset by wiping the store (`deno task kvctl wipe`) or deleting the local SQLite
 * file; the next boot re-seeds from scratch.
 */
export async function seedDemo(
  runtime: Runtime,
  kv: Deno.Kv,
): Promise<DemoData> {
  // The sentinel goes through the raw KV handle on purpose: the seed flow is
  // dev/debug bookkeeping, not part of the service surface.
  const seeded = (await kv.get<boolean>(SEED_SENTINEL)).value;
  if (seeded) {
    return loadDemo(runtime);
  }

  // Dev demo data; the only caller gates on DENO_ENV=development. Granting
  // admin here keeps /admin reachable after a wipe without kvctl.
  const created = await runtime.runPromise(
    Workspaces.use((store) =>
      store.createUser({ email: "demo@example.com", name: "Demo User" }),
    ),
  );
  const demoUser =
    (await runtime.runPromise(
      Workspaces.use((store) => store.setUserRole(created.id, "admin")),
    )) ?? created;
  const demoWorkspace = await runtime.runPromise(
    Workspaces.use((store) => store.createWorkspace("Demo", demoUser.id)),
  );

  await seedDemoFiles(runScoped(runtime, demoWorkspace.id));

  await kv.set(SEED_SENTINEL, true);
  return { demoUser, demoWorkspace };
}

/** Load the previously-seeded demo entities (sentinel already set). */
async function loadDemo(runtime: Runtime): Promise<DemoData> {
  const demoUser = await runtime.runPromise(
    Workspaces.use((store) => store.getUserByEmail("demo@example.com")),
  );
  if (!demoUser) {
    throw new Error(
      "Seed sentinel is set but demo users are missing; run `deno task kvctl wipe` and restart.",
    );
  }
  const workspaces = await runtime.runPromise(
    Workspaces.use((store) => store.listWorkspacesForUser(demoUser.id)),
  );
  const demoWorkspace = workspaces.find((w) => w.name === "Demo");
  if (!demoWorkspace) {
    throw new Error(
      "Seed sentinel is set but the demo workspace is missing; run `deno task kvctl wipe` and restart.",
    );
  }
  return { demoUser, demoWorkspace };
}
