import { UserEmailTakenError } from "@essayist/core";
import { define } from "@/define.ts";
import { store } from "@/store.ts";
import { getGoogleUserInfo, getOAuthHelpers } from "@/utils/oauth.ts";
import { createSession } from "@/utils/sessions.ts";

/**
 * Google OAuth callback. The @deno/kv-oauth helper validates the callback,
 * exchanges the code for tokens, sets the session cookie, and returns a
 * redirect to the success URL captured at sign-in. We then use the access
 * token to fetch the user's Google profile, upsert an essayist `User` keyed
 * by email, and record the session -> user id mapping.
 */
export const handler = define.handlers(async (ctx) => {
  const helpers = getOAuthHelpers(ctx.req);
  const { response, sessionId, tokens } = await helpers.handleCallback(ctx.req);

  const info = await getGoogleUserInfo(tokens.accessToken);
  let user = await store.getUserByEmail(info.email);
  if (!user) {
    try {
      user = await store.createUser(info);
    } catch (error) {
      // Race: another concurrent login created the same email first.
      if (error instanceof UserEmailTakenError) {
        user = await store.getUserByEmail(info.email);
      } else {
        throw error;
      }
    }
  }
  if (!user) {
    throw new Error(`failed to resolve user for ${info.email}`);
  }

  // Refresh name/picture from Google on each login (they can change).
  if (info.name !== user.name || info.picture !== user.picture) {
    const updated = await store.updateUser(user.id, {
      name: info.name,
      picture: info.picture,
    });
    if (updated) user = updated;
  }

  await createSession(sessionId, user.id);
  return response;
});
