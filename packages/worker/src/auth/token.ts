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

/** Google reports the grant as permanently dead (400 invalid_grant). */
export class GrantRevokedError extends Schema.TaggedError<GrantRevokedError>()(
  "GrantRevokedError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "the Google refresh grant was revoked or expired";
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

// Thrown inside tryPromise; the catch inspects it to re-tag revoked grants.
class EndpointRejection extends Error {
  readonly revoked: boolean;
  constructor(status: number, body: string) {
    super(`token refresh failed: ${status} ${body}`);
    this.revoked = body.includes("invalid_grant");
  }
}

function refreshRequest(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Effect.Effect<typeof TokenResponse.Type, TokenRefreshError | GrantRevokedError> {
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
        throw new EndpointRejection(response.status, await response.text().catch(() => ""));
      }
      return Schema.decodeSync(TokenResponse)(await response.json());
    },
    catch: (cause) =>
      cause instanceof EndpointRejection && cause.revoked
        ? new GrantRevokedError({ cause })
        : new TokenRefreshError({ cause }),
  }).pipe(
    Effect.tapError((err) =>
      Effect.logError("google token refresh rejected", { cause: String(err.cause) }),
    ),
  );
}

/**
 * A fresh access token for the session: the cached one while it is
 * still valid, otherwise a refresh via Google. `undefined` when the
 * session has no tokens (created before the Drive scope existed) or
 * nothing valid can be produced (revoked grant, no stored refresh
 * token).
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
      yield* Effect.logWarning("google token refresh skipped: no refresh token stored", {
        sessionId: session.id,
      });
      // The stored token is expired or inside the refresh buffer.
      return undefined;
    }
    const fresh = yield* refreshRequest(clientId, clientSecret, refreshToken).pipe(
      Effect.catchTags({
        GrantRevokedError: () =>
          Effect.gen(function* () {
            // The grant is permanently revoked: drop the dead stored tokens.
            yield* auth.updateSessionTokens(sessionId, session.userId, {
              ...tokens,
              refreshToken: undefined,
            });
            yield* auth.deleteRefreshToken(session.userId);
            yield* Effect.logWarning("google refresh token revoked; cleared stored tokens", {
              sessionId: session.id,
            });
            return undefined;
          }),
      }),
    );
    if (fresh === undefined) return undefined;
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
    yield* Effect.logInfo("google access token refreshed", {
      sessionId: session.id,
      expiresIn: fresh.expires_in,
    });
    return refreshed.accessToken;
  });

function expiresAtValid(tokens: SessionTokens, now: number): boolean {
  return tokens.expiresAt - now > REFRESH_BUFFER_MS;
}

/**
 * Fresh session tokens via the user-level refresh token; `undefined`
 * without one or when Google rejects the grant. A rejected refresh
 * still signs the user in, without Google API access; a revoked grant
 * also loses the stored token.
 */
export const refreshTokensForUser = (
  userId: string,
  clientId: string,
  clientSecret: string,
): Effect.Effect<SessionTokens | undefined, PersistenceError | TokenRefreshError, AuthStore> =>
  Effect.gen(function* () {
    const auth = yield* AuthStore;
    const refreshToken = yield* auth.getRefreshToken(userId);
    if (refreshToken === undefined) return undefined;

    const now = yield* Clock.currentTimeMillis;
    const fresh = yield* refreshRequest(clientId, clientSecret, refreshToken).pipe(
      // A rejected grant still signs the user in, without Google API access.
      Effect.tapError(() =>
        Effect.logWarning(
          "google token refresh rejected at one-tap sign-in; continuing without Google API access",
        ),
      ),
      Effect.catchTags({
        TokenRefreshError: () => Effect.succeed(undefined),
        GrantRevokedError: () =>
          Effect.gen(function* () {
            yield* auth.deleteRefreshToken(userId);
            return undefined;
          }),
      }),
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
