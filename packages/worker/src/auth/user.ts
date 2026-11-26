/**
 * Finds or creates the app user for a Google profile and refreshes the stored name/picture when
 * they changed.
 */

import { PersistenceError, User, type UserInput, Workspaces } from "@essayist/core";
import { Effect, Option, Schema } from "effect";

import type { UserData } from "#/state.ts";

export const encodeUser: (user: User) => UserData = Schema.encodeSync(User.json);

export const resolveGoogleUser = (
  info: UserInput,
): Effect.Effect<User, PersistenceError, Workspaces> =>
  Effect.gen(function* () {
    const user =
      (yield* Workspaces.use((store) => store.getUserByEmail(info.email))) ??
      (yield* Workspaces.use((store) => store.createUser(info)).pipe(
        // A concurrent sign-in may have created the same email; re-read
        Effect.catchTag("UserEmailTakenError", () =>
          Workspaces.use((store) => store.getUserByEmail(info.email)),
        ),
      ));
    if (user === undefined) {
      return yield* Effect.fail(
        new PersistenceError({
          cause: new Error(`failed to resolve user for ${info.email}`),
        }),
      );
    }

    if (
      (info.name || undefined) !== Option.getOrUndefined(user.name) ||
      (info.picture || undefined) !== Option.getOrUndefined(user.picture)
    ) {
      const updated = yield* Workspaces.use((store) =>
        store.updateUser(user.id, {
          name: info.name,
          picture: info.picture,
        }),
      );
      return updated ?? user;
    }
    return user;
  });
