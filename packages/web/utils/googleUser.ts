import { type User, UserEmailTakenError, type UserInput } from "@essayist/core";
import { workspaceStore } from "@/store.ts";

/**
 * Finds or creates the app user for a Google profile and refreshes the
 * stored name/picture when they changed.
 */
export async function resolveGoogleUser(info: UserInput): Promise<User> {
  let user = await workspaceStore.getUserByEmail(info.email);
  if (!user) {
    try {
      user = await workspaceStore.createUser(info);
    } catch (error) {
      // Race: another concurrent login created the same email first.
      if (error instanceof UserEmailTakenError) {
        user = await workspaceStore.getUserByEmail(info.email);
      } else {
        throw error;
      }
    }
  }
  if (!user) {
    throw new Error(`failed to resolve user for ${info.email}`);
  }

  if (info.name !== user.name || info.picture !== user.picture) {
    const updated = await workspaceStore.updateUser(user.id, {
      name: info.name,
      picture: info.picture,
    });
    if (updated) user = updated;
  }
  return user;
}
