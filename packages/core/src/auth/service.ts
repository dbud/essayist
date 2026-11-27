import { Context, type Effect, type Option } from "effect";

import type { AuthSession, SessionTokens } from "./types.ts";

export interface Interface {
  /** Insert a session; expiry applies from the insert time. */
  createSession(id: string, userId: string, tokens?: SessionTokens): Effect.Effect<void>;
  /** Read a session; none when it is missing or expired. */
  getSession(id: string): Effect.Effect<Option.Option<AuthSession>>;
  /** Replace the tokens of a session and re-apply the TTL. A no-op
   * when the session is gone. */
  updateSessionTokens(id: string, tokens: SessionTokens): Effect.Effect<void>;
  /** Remove a session (sign-out). */
  deleteSession(id: string): Effect.Effect<void>;
  /** Store the user-level refresh token, surviving across sessions. */
  setRefreshToken(userId: string, refreshToken: string): Effect.Effect<void>;
  /** Read the user-level refresh token, or none. */
  getRefreshToken(userId: string): Effect.Effect<Option.Option<string>>;
  /** Delete the user-level refresh token, e.g. after a revoked grant. */
  deleteRefreshToken(userId: string): Effect.Effect<void>;
}

/** Auth session storage as an Effect service. */
export class AuthStore extends Context.Service<AuthStore, Interface>()(
  "@essayist/core/auth/AuthStore",
) {}
