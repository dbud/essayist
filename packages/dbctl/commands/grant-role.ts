import { Command, EnumType } from "@cliffy/command";
import { USER_ROLES, type UserRole, Workspaces } from "@essayist/core";
import { Console, Effect, Option } from "effect";

import { CommandError, type DbctlGlobals, runStore } from "#/db.ts";

const ROLE = new EnumType([...USER_ROLES]);

export const grantRole = new Command<DbctlGlobals>()
  .description("Set the site-wide role of a user.")
  .type("role", ROLE)
  .arguments("<emailOrId:string> <role:role>")
  .action((options, emailOrId: string, role: UserRole) =>
    runStore(
      options,
      Effect.gen(function* () {
        const workspaces = yield* Workspaces;
        const byEmail = yield* workspaces.getUserByEmail(emailOrId);
        const found = Option.isSome(byEmail) ? byEmail : yield* workspaces.getUser(emailOrId);
        if (Option.isNone(found)) {
          return yield* new CommandError({ message: `no user matching "${emailOrId}"` });
        }
        const user = yield* workspaces.setUserRole(found.value.id, role);
        yield* Console.log(`granted ${role} to ${user.email} (${user.id})`);
      }),
    ),
  );
