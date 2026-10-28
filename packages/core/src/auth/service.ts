import { Context, type Effect } from "effect";

import type { PersistenceError } from "#/persistence/service.ts";

import type { Session, SessionTokens } from "./types.ts";

export interface Interface {
  /** Insert a session; expiry applies from the insert time. */
  createSession(
    id: string,
    userId: string,
    tokens?: SessionTokens,
  ): Effect.Effect<void, PersistenceError>;
  /** Read a session; absent and expired sessions yield `undefined`. */
  getSession(id: string): Effect.Effect<Session | undefined, PersistenceError>;
  /** Replace the tokens of a session and re-apply the TTL. A no-op
   * when the session is gone. */
  updateSessionTokens(
    id: string,
    userId: string,
    tokens: SessionTokens,
  ): Effect.Effect<void, PersistenceError>;
  /** Remove a session (sign-out). */
  deleteSession(id: string): Effect.Effect<void, PersistenceError>;
  /** Store the user-level refresh token, surviving across sessions. */
  setRefreshToken(userId: string, refreshToken: string): Effect.Effect<void, PersistenceError>;
  /** Read the user-level refresh token, or `undefined`. */
  getRefreshToken(userId: string): Effect.Effect<string | undefined, PersistenceError>;
  /** Delete the user-level refresh token, e.g. after a revoked grant. */
  deleteRefreshToken(userId: string): Effect.Effect<void, PersistenceError>;
}

/** Auth session storage as an Effect service. */
export class AuthStore extends Context.Service<AuthStore, Interface>()(
  "@essayist/core/auth/AuthStore",
) {}
