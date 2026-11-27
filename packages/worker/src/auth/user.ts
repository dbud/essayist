/**
 * Finds or creates the app user for a Google profile and refreshes the stored name/picture when
 * they changed.
 */

import { User, type UserInput, Workspaces } from "@essayist/core";
import { Effect, Option, Schema } from "effect";

import type { UserData } from "#/state.ts";

export const encodeUser: (user: User) => UserData = Schema.encodeSync(User.json);

export const resolveGoogleUser = (info: UserInput): Effect.Effect<User, never, Workspaces> =>
  Effect.gen(function* () {
    const workspaces = yield* Workspaces;
    const found = yield* workspaces.getUserByEmail(info.email);
    const user = Option.isSome(found)
      ? found.value
      : yield* workspaces.createUser(info).pipe(
          // a concurrent sign-in created the same email first, so the user is there to read
          Effect.catchTag("UserEmailTakenError", () =>
            Effect.map(workspaces.getUserByEmail(info.email), Option.getOrThrow),
          ),
        );

    if (
      (info.name || undefined) !== Option.getOrUndefined(user.name) ||
      (info.picture || undefined) !== Option.getOrUndefined(user.picture)
    ) {
      // the user was just read or created, so a missing one is a defect
      return yield* Effect.orDie(
        workspaces.updateUser(user.id, { name: info.name, picture: info.picture }),
      );
    }
    return user;
  });
