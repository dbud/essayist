/** Auth session and refresh-token models. */

/** Google OAuth tokens attached to a session, plus the epoch-ms expiry
 * derived from `expiresIn` at sign-in. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly tokenType: string | undefined;
  readonly expiresIn: number | undefined;
  readonly refreshToken: string | undefined;
  readonly expiresAt: number;
}

/** A session: the user it belongs to and its optional tokens. */
export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly tokens: SessionTokens | undefined;
}
