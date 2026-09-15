import { define } from "@/define.ts";
import { resolveGoogleUser } from "@/utils/googleUser.ts";
import { getGoogleUserInfo, getOAuthHelpers } from "@/utils/oauth.ts";
import {
  createSession,
  setUserRefreshToken,
  toSessionTokens,
} from "@/utils/sessions.ts";

/**
 * Google OAuth callback. The @deno/kv-oauth helper validates the callback,
 * exchanges the code for tokens, sets the session cookie, and returns a
 * redirect to the success URL captured at sign-in. We then use the access
 * token to fetch the user's Google profile, upsert an essayist User keyed
 * by email, and record the session -> user id mapping with the OAuth tokens
 * attached so server-side Drive calls can re-use the grant.
 */
export const handler = define.handlers(async (ctx) => {
  const helpers = getOAuthHelpers(ctx.req);
  const { response, sessionId, tokens } = await helpers.handleCallback(ctx.req);

  const info = await getGoogleUserInfo(tokens.accessToken);
  const user = await resolveGoogleUser(info);

  // Persist the OAuth tokens onto the app session so server-side Google API
  // calls (Drive export) can re-use the grant; see utils/googleToken.ts.
  await createSession(sessionId, user.id, toSessionTokens(tokens));
  // Store the refresh token at the user level so it survives across sessions.
  // Google only returns it on the first authorization; subsequent sign-ins
  // return a new access token but no refresh token.
  if (tokens.refreshToken) {
    await setUserRefreshToken(user.id, tokens.refreshToken);
  }
  return response;
});
