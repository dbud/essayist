import type { Tokens } from "@deno/kv-oauth";
import { kv } from "@/store.ts";

// Maps the kv-oauth session id (from the signed cookie) to an app user id and
// optionally the user's Google OAuth tokens. kv-oauth 0.11 returns tokens at
// callback but does not persist them; without this row they'd be discarded.
// Refresh logic lives in utils/googleToken.ts.
const APP_SESSIONS = "app_sessions";

// Sliding TTL re-applied by updateSessionTokens on each refresh.
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// OAuth tokens stored on the session row. Extends kv-oauth's `Tokens` with a
// derived `expiresAt` so we can check expiry without re-parsing `expiresIn`.
// The access token is short-lived; googleToken.ts refreshes it via the refresh
// token before expiry.
export interface SessionTokens extends Tokens {
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

interface AppSession {
  userId: string;
  createdAt: number;
  tokens?: SessionTokens;
}

export function toSessionTokens(tokens: Tokens): SessionTokens {
  const expiresInMs = (tokens.expiresIn ?? 3600) * 1000;
  return { ...tokens, expiresAt: Date.now() + expiresInMs };
}

export async function createSession(
  sessionId: string,
  userId: string,
  tokens?: SessionTokens,
): Promise<void> {
  await kv.set(
    [APP_SESSIONS, sessionId],
    { userId, createdAt: Date.now(), tokens },
    { expireIn: SESSION_TTL_MS },
  );
}

export async function getSession(
  sessionId: string,
): Promise<AppSession | null> {
  const res = await kv.get<AppSession>([APP_SESSIONS, sessionId]);
  return res.value;
}

export async function getUserIdForSession(
  sessionId: string,
): Promise<string | undefined> {
  return (await getSession(sessionId))?.userId;
}

// No-op if the session was deleted between read and refresh. Re-applies the
// TTL so active users get sliding expiration.
export async function updateSessionTokens(
  sessionId: string,
  tokens: SessionTokens,
): Promise<void> {
  const existing = await getSession(sessionId);
  if (!existing) return;
  await kv.set(
    [APP_SESSIONS, sessionId],
    { ...existing, tokens },
    { expireIn: SESSION_TTL_MS },
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  await kv.delete([APP_SESSIONS, sessionId]);
}
