import {
  createGoogleOAuthConfig,
  createHelpers,
  type Helpers,
} from "@deno/kv-oauth";
import type { UserInput } from "@essayist/core";

/**
 * Google OAuth helpers
 *
 * Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars. In dev
 * without these set, calling {@link getOAuthHelpers} throws; the auth
 * middleware catches that and falls back to the demo user.
 */
let cached: { origin: string; helpers: Helpers } | undefined;

export function getOAuthHelpers(request: Request): Helpers {
  const origin = new URL(request.url).origin;
  if (cached && cached.origin === origin) return cached.helpers;
  const oauthConfig = createGoogleOAuthConfig({
    redirectUri: `${origin}/oauth/callback`,
    scope: ["openid", "email", "profile"],
  });
  const helpers = createHelpers(oauthConfig);
  cached = { origin, helpers };
  return helpers;
}

export type GoogleUserInfo = UserInput;

/** Fetch the authenticated user's profile from Google's userinfo endpoint. */
export async function getGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`google userinfo request failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    email: string;
    name?: string;
    picture?: string;
  };
  return { email: body.email, name: body.name, picture: body.picture };
}
