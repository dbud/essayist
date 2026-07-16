import { kv } from "@/store.ts";

// App-level session store: maps the @deno/kv-oauth session id (stored in the
// signed cookie) to an app user id.
const APP_SESSIONS = "app_sessions";

interface AppSession {
  userId: string;
  createdAt: number;
}

export async function createSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  await kv.set([APP_SESSIONS, sessionId], {
    userId,
    createdAt: Date.now(),
  });
}

export async function getUserIdForSession(
  sessionId: string,
): Promise<string | undefined> {
  const res = await kv.get<AppSession>([APP_SESSIONS, sessionId]);
  return res.value?.userId;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await kv.delete([APP_SESSIONS, sessionId]);
}
