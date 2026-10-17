import { Command } from "@cliffy/command";
import {
  demoFiles,
  Files,
  seedDemoFiles,
  WorkspaceId,
  Workspaces,
} from "@essayist/core";
import { Effect } from "effect";
import type { KvctlGlobals } from "#/globals.ts";
import { withStore } from "#/kv.ts";

const scoped = <A, E, R>(
  effect: Effect.Effect<A, E, R | WorkspaceId>,
  wsId: string,
): Effect.Effect<A, E, R> =>
  Effect.provideService(effect, WorkspaceId, { wsId });

export const seedDemo = new Command<KvctlGlobals>()
  .description("Seed a demo user, workspace, and sample essay.")
  .option("--email <email:string>", "Demo user email.", {
    default: "demo@example.com",
  })
  .option("--name <name:string>", "Demo user display name.", {
    default: "Demo User",
  })
  .option("--ws-name <name:string>", "Demo workspace name.", {
    default: "Demo",
  })
  .action(({ email, name, wsName, target, local }) =>
    withStore({ target, local }, async ({ runtime }) => {
      // Create or reuse the demo user; new users get site admin
      let user = await runtime.runPromise(
        Effect.orDie(Workspaces.use((store) => store.getUserByEmail(email))),
      );
      if (!user) {
        const created = await runtime.runPromise(
          Effect.orDie(
            Workspaces.use((store) => store.createUser({ email, name })),
          ),
        );
        user =
          (await runtime.runPromise(
            Effect.orDie(
              Workspaces.use((store) => store.setUserRole(created.id, "admin")),
            ),
          )) ?? created;
      }

      // Create or reuse the workspace by name.
      const workspaces = await runtime.runPromise(
        Effect.orDie(
          Workspaces.use((store) => store.listWorkspacesForUser(user.id)),
        ),
      );
      let workspace = workspaces.find((w) => w.name === wsName);
      if (!workspace) {
        workspace = await runtime.runPromise(
          Effect.orDie(
            Workspaces.use((store) => store.createWorkspace(wsName, user.id)),
          ),
        );
      }

      // Seed the essay and marks only for a workspace that lacks them.
      const files = await runtime.runPromise(
        Effect.orDie(
          scoped(
            Files.use((store) => store.list()),
            workspace.id,
          ),
        ),
      );
      const seeded = files.some((file) => file.path in demoFiles);
      if (!seeded) {
        await runtime.runPromise(
          Effect.orDie(scoped(seedDemoFiles(), workspace.id)),
        );
      }

      console.log(
        `seeded demo: user '${user.id}' (${user.email}), workspace '${workspace.id}' (${workspace.name})${seeded ? "" : ", essay and marks"}`,
      );
    }),
  );
