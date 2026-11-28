import { Command, EnumType } from "@cliffy/command";
import { USER_ROLES, Workspaces } from "@essayist/core";
import { Effect, Option } from "effect";

import { withStore } from "#/db.ts";
import type { DbctlGlobals } from "#/globals.ts";

const ROLE = new EnumType([...USER_ROLES]);

export const grantRole = new Command<DbctlGlobals>()
  .description("Set a user's site-wide role.")
  .type("role", ROLE)
  .arguments("<emailOrId:string> <role:role>")
  .action(({ remote }, emailOrId: string, role: "admin" | "writer") =>
    withStore({ remote }, async ({ runtime }) => {
      const updated = await runtime.runPromise(
        Effect.gen(function* () {
          const workspaces = yield* Workspaces;
          const byEmail = yield* workspaces.getUserByEmail(emailOrId);
          const user = Option.isSome(byEmail) ? byEmail : yield* workspaces.getUser(emailOrId);
          if (Option.isNone(user)) return Option.none();
          // the user was just found
          return Option.some(yield* Effect.orDie(workspaces.setUserRole(user.value.id, role)));
        }),
      );
      if (Option.isNone(updated)) {
        console.error(`no user matching "${emailOrId}"`);
        process.exitCode = 1;
        return;
      }
      console.log(`granted ${role} to ${updated.value.email} (${updated.value.id})`);
    }),
  );
