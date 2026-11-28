import { Command } from "@cliffy/command";
import { demoFiles, Files, seedDemoFiles, WorkspaceId, Workspaces } from "@essayist/core";
import { Effect } from "effect";

import type { KvctlGlobals } from "#/globals.ts";
import { withStore } from "#/kv.ts";

const scoped = <A, E, R>(
  effect: Effect.Effect<A, E, R | WorkspaceId>,
  wsId: string,
): Effect.Effect<A, E, R> => Effect.provideService(effect, WorkspaceId, { wsId });

// A per-workspace companion file: its name and content derive from the workspace, so content on
// screen identifies the workspace it came from.
const notesPath = (wsName: string): string => {
  const slug =
    wsName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";
  return `notes-${slug}.md`;
};

const notesContent = (wsName: string): string =>
  `# Notes from ${wsName}

This workspace is ${wsName}. This file exists only in ${wsName}, and its
content names ${wsName} several times, so whatever page is showing it is
showing a file that belongs to this workspace.

If this heading does not match the workspace you think you opened, the
navigation sent you somewhere else than you asked for.
`;

const DEMO_EMAIL = "demo@example.com";

export const seedDemo = new Command<KvctlGlobals>()
  .description("Seed a user, workspace, and sample essay.")
  .option("--email <email:string>", "User email; DEV_USER_EMAIL from .env, else the demo user.", {
    default: process.env.DEV_USER_EMAIL ?? DEMO_EMAIL,
  })
  .option("--name <name:string>", "Display name for a new user; sign-in replaces it.")
  .option("--ws-name <name:string>", "Demo workspace name.", {
    default: "Demo",
  })
  .action(({ email, name, wsName, target, local }) =>
    withStore({ target, local }, async ({ runtime }) => {
      // Create or reuse the user; new users get site admin
      let user = await runtime.runPromise(
        Effect.orDie(Workspaces.use((store) => store.getUserByEmail(email))),
      );
      if (!user) {
        const created = await runtime.runPromise(
          Effect.orDie(
            Workspaces.use((store) =>
              store.createUser({
                email,
                name: name ?? (email === DEMO_EMAIL ? "Demo User" : undefined),
              }),
            ),
          ),
        );
        user =
          (await runtime.runPromise(
            Effect.orDie(Workspaces.use((store) => store.setUserRole(created.id, "admin"))),
          )) ?? created;
      }

      // Create or reuse the workspace by name.
      const workspaces = await runtime.runPromise(
        Effect.orDie(Workspaces.use((store) => store.listWorkspacesForUser(user.id))),
      );
      let workspace = workspaces.find((entry) => entry.workspace.name === wsName)?.workspace;
      if (!workspace) {
        workspace = await runtime.runPromise(
          Effect.orDie(Workspaces.use((store) => store.createWorkspace(wsName, user.id))),
        );
      }

      // Seed files only for a workspace that lacks them: the essay (with marks, fresh essay only)
      // plus the per-workspace notes file.
      const files = await runtime.runPromise(
        Effect.orDie(
          scoped(
            Files.use((store) => store.list()),
            workspace.id,
          ),
        ),
      );
      const essayFresh = !files.some((file) => file.path in demoFiles);
      if (essayFresh) {
        await runtime.runPromise(Effect.orDie(scoped(seedDemoFiles(), workspace.id)));
      }
      const notes = notesPath(wsName);
      const notesFresh = !files.some((file) => file.path === notes);
      if (notesFresh) {
        await runtime.runPromise(
          Effect.orDie(
            scoped(
              Files.use((store) => store.write(notes, notesContent(wsName))),
              workspace.id,
            ),
          ),
        );
      }

      const seeded = [essayFresh ? "essay and marks" : null, notesFresh ? notes : null].filter(
        (s) => s !== null,
      );
      console.log(
        `seeded: user '${user.id}' (${user.email}), workspace '${workspace.id}' (${workspace.name})${seeded.length ? `, ${seeded.join(", ")}` : ""}`,
      );
    }),
  );
