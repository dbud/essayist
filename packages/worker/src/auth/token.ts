/**
 * Google token refresh for auth sessions.
 */

import { AuthStore, type PersistenceError, type SessionTokens } from "@essayist/core";
import { Clock, Effect, Schema } from "effect";

/** Google's token endpoint rejected a refresh. */
export class TokenRefreshError extends Schema.TaggedError<TokenRefreshError>()(
  "TokenRefreshError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "the Google token refresh failed";
  }
}

// Refresh just before the real expiry; the buffer covers a slow network.
const REFRESH_BUFFER_MS = 60_000;

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The Google token endpoint's response to a refresh grant. */
const TokenResponse = Schema.Struct({
  access_token: Schema.NonEmptyString,
  expires_in: Schema.Number,
  refresh_token: Schema.optional(Schema.NonEmptyString),
});

function refreshRequest(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Effect.Effect<typeof TokenResponse.Type, TokenRefreshError> {
  return Effect.tryPromise({
    try: async () => {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`token refresh failed: ${response.status} ${text}`);
      }
      return Schema.decodeSync(TokenResponse)(await response.json());
    },
    catch: (cause) => new TokenRefreshError({ cause }),
  });
}

/**
 * A fresh access token for the session: the cached one while it is
 * still valid, otherwise a refresh via Google. `undefined` when the
 * session has no tokens (created before the Drive scope existed).
 */
export const getValidAccessToken = (
  sessionId: string,
  clientId: string,
  clientSecret: string,
): Effect.Effect<string | undefined, PersistenceError | TokenRefreshError, AuthStore> =>
  Effect.gen(function* () {
    const auth = yield* AuthStore;
    const session = yield* auth.getSession(sessionId);
    const tokens = session?.tokens;
    if (session === undefined || tokens === undefined) return undefined;

    const now = yield* Clock.currentTimeMillis;
    if (expiresAtValid(tokens, now)) return tokens.accessToken;

    // The session-level refresh token first, the user-level store as
    // the fallback: Google returns a refresh token only on the first
    // authorization.
    const refreshToken = tokens.refreshToken ?? (yield* auth.getRefreshToken(session.userId));
    if (refreshToken === undefined) {
      // Cannot refresh; let Google reject the stale token.
      return tokens.accessToken;
    }
    const fresh = yield* refreshRequest(clientId, clientSecret, refreshToken);
    const nextRefreshToken = fresh.refresh_token ?? refreshToken;
    const refreshed: SessionTokens = {
      accessToken: fresh.access_token,
      tokenType: tokens.tokenType,
      expiresIn: fresh.expires_in,
      refreshToken: nextRefreshToken,
      expiresAt: now + fresh.expires_in * 1000,
    };
    yield* auth.updateSessionTokens(sessionId, session.userId, refreshed);
    yield* auth.setRefreshToken(session.userId, nextRefreshToken);
    return refreshed.accessToken;
  });

function expiresAtValid(tokens: SessionTokens, now: number): boolean {
  return tokens.expiresAt - now > REFRESH_BUFFER_MS;
}

/**
 * Fresh session tokens via the user-level refresh token; `undefined`
 * without one, or when the grant is rejected (revoked). On failure the
 * sign-in still succeeds, just without Google API access.
 */
export const refreshTokensForUser = (
  userId: string,
  clientId: string,
  clientSecret: string,
): Effect.Effect<SessionTokens | undefined, PersistenceError, AuthStore> =>
  Effect.gen(function* () {
    const auth = yield* AuthStore;
    const refreshToken = yield* auth.getRefreshToken(userId);
    if (refreshToken === undefined) return undefined;

    const now = yield* Clock.currentTimeMillis;
    const fresh = yield* refreshRequest(clientId, clientSecret, refreshToken).pipe(
      // A rejected grant still signs the user in, without Google API access.
      Effect.catchTag("TokenRefreshError", () => Effect.succeed(undefined)),
    );
    if (fresh === undefined) return undefined;

    return {
      accessToken: fresh.access_token,
      tokenType: undefined,
      expiresIn: fresh.expires_in,
      refreshToken: fresh.refresh_token ?? refreshToken,
      expiresAt: now + fresh.expires_in * 1000,
    } satisfies SessionTokens;
  });
