import {
  type User,
  UserEmailTakenError,
  type UserInput,
  Workspaces,
} from "@essayist/core";
import { runtime } from "#/store.ts";

/**
 * Finds or creates the app user for a Google profile and refreshes the
 * stored name/picture when they changed.
 */
export async function resolveGoogleUser(info: UserInput): Promise<User> {
  let user = await runtime.runPromise(
    Workspaces.use((store) => store.getUserByEmail(info.email)),
  );
  if (!user) {
    try {
      user = await runtime.runPromise(
        Workspaces.use((store) => store.createUser(info)),
      );
    } catch (error) {
      // Race: another concurrent login created the same email first.
      if (error instanceof UserEmailTakenError) {
        user = await runtime.runPromise(
          Workspaces.use((store) => store.getUserByEmail(info.email)),
        );
      } else {
        throw error;
      }
    }
  }
  if (!user) {
    throw new Error(`failed to resolve user for ${info.email}`);
  }

  // A const alias keeps the User narrowing inside the use() callback.
  const current = user;
  if (info.name !== current.name || info.picture !== current.picture) {
    const updated = await runtime.runPromise(
      Workspaces.use((store) =>
        store.updateUser(current.id, {
          name: info.name,
          picture: info.picture,
        }),
      ),
    );
    if (updated) user = updated;
  }
  return user;
}
