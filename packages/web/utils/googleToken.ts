import {
  getSession,
  type SessionTokens,
  updateSessionTokens,
} from "@/utils/sessions.ts";

/**
 * Resolve a usable Google access token for a session.
 *
 * Returns the cached access token if it has not expired (with a small buffer),
 * otherwise refreshes it via Google's token endpoint and persists the new
 * tokens onto the session row. Returns `null` when the session has no tokens
 * (e.g. created before the `drive.file` scope was added) -- callers should
 * translate that to a 401 so the client re-authenticates.
 */

// Refresh a little before the real expiry so we don't race the network.
const REFRESH_BUFFER_MS = 60_000;

export async function getValidAccessToken(
  sessionId: string,
): Promise<string | null> {
  const session = await getSession(sessionId);
  if (!session?.tokens) return null;

  const { accessToken, refreshToken, expiresAt } = session.tokens;
  if (expiresAt - Date.now() > REFRESH_BUFFER_MS) return accessToken;
  if (!refreshToken) return accessToken; // can't refresh; let Google reject it

  const refreshed = await refreshWithGoogle(refreshToken);
  await updateSessionTokens(sessionId, refreshed);
  return refreshed.accessToken;
}

async function refreshWithGoogle(refreshToken: string): Promise<SessionTokens> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token refresh failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    tokenType: json.token_type,
    expiresIn: json.expires_in,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}
