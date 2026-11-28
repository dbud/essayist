import { Command } from "@cliffy/command";
import {
  demoFiles,
  Files,
  seedDefaultConfig,
  seedDemoFiles,
  WorkspaceId,
  Workspaces,
} from "@essayist/core";
import { Console, Effect, Option } from "effect";

import { type DbctlGlobals, runStore } from "#/db.ts";

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

export const seed = new Command<DbctlGlobals>()
  .description(
    "Seed the default review config into an empty store, and a demo workspace for a user.",
  )
  .option("--email <email:string>", "User email; DEV_USER_EMAIL from .env, else the demo user.", {
    default: process.env.DEV_USER_EMAIL ?? DEMO_EMAIL,
  })
  .option("--name <name:string>", "Display name for a new user; sign-in replaces it.")
  .option("--ws-name <name:string>", "Demo workspace name.", {
    default: "Demo",
  })
  .action(({ email, name, wsName, ...globals }) =>
    runStore(
      globals,
      Effect.gen(function* () {
        const config = (yield* seedDefaultConfig) ? "the default review config" : null;

        // a new user is a site admin, so the demo can also show the admin pages
        const workspaces = yield* Workspaces;
        const found = yield* workspaces.getUserByEmail(email);
        const user = Option.isSome(found)
          ? found.value
          : yield* Effect.flatMap(
              workspaces.createUser({
                email,
                name: name ?? (email === DEMO_EMAIL ? "Demo User" : undefined),
              }),
              (created) => workspaces.setUserRole(created.id, "admin"),
            );

        const owned = yield* workspaces.listWorkspacesForUser(user.id);
        const workspace =
          owned.find((entry) => entry.workspace.name === wsName)?.workspace ??
          (yield* workspaces.createWorkspace(wsName, user.id));

        // files only for a workspace that lacks them, the essay with its review first
        const files = yield* Effect.gen(function* () {
          const store = yield* Files;
          const paths = new Set((yield* store.list()).map(({ file }) => file.path));
          const essay = Object.keys(demoFiles).some((path) => paths.has(path))
            ? null
            : "the essay and its review";
          if (essay !== null) yield* seedDemoFiles();
          const notesFile = notesPath(wsName);
          const notes = paths.has(notesFile) ? null : notesFile;
          if (notes !== null) yield* store.createAt(notes, notesContent(wsName));
          return [essay, notes];
        }).pipe(Effect.provideService(WorkspaceId, { wsId: workspace.id }));

        const seeded = [config, ...files].filter((item) => item !== null);
        yield* Console.log(
          `user '${user.id}' (${user.email}), workspace '${workspace.id}' (${workspace.name})` +
            (seeded.length > 0 ? `; seeded ${seeded.join(", ")}` : "; nothing to seed"),
        );
      }),
    ),
  );
