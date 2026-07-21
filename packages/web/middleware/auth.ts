import type { Middleware } from "fresh";
import { define, type State } from "@/define.ts";
import { demoUser, store } from "@/store.ts";
import { getOAuthHelpers } from "@/utils/oauth.ts";
import { getUserIdForSession } from "@/utils/sessions.ts";

const isDev = Deno.env.get("DENO_ENV") === "development";

/**
 * Resolves `ctx.state.user` for each request.
 *
 * Resolution order:
 *  1. `X-User-Id` header, dev only — lets local scripts/tests act as a
 *     specific seeded user (e.g. demoUser2 for sharing tests). Disabled in
 *     production, where trusting a client-supplied id would be an auth bypass.
 *  2. Valid Google OAuth session cookie (see routes/oauth/*).
 *  3. The seeded demo user, in dev only.
 *  4. Otherwise unauthenticated: API routes get 401 JSON, browser routes
 *     redirect to /login.
 *
 * The /oauth/* routes and /login page are skipped so sign-in / sign-out /
 * callback and the login page itself can run before a user is resolved.
 */
const authMiddleware: Middleware<State> = define.middleware(async (ctx) => {
  const path = ctx.url.pathname;
  if (path.startsWith("/oauth/") || path === "/login") {
    return ctx.next();
  }

  // Dev only: lets local scripts/tests act as a specific seeded user
  // (e.g. demoUser2 for sharing tests). Disabled in production.
  if (isDev) {
    const headerId = ctx.req.headers.get("X-User-Id");
    if (headerId) {
      const user = await store.getUser(headerId);
      if (!user) {
        return Response.json({ error: "Unknown user" }, { status: 401 });
      }
      ctx.state.user = user;
      return ctx.next();
    }
  }

  try {
    const helpers = getOAuthHelpers(ctx.req);
    const sessionId = await helpers.getSessionId(ctx.req);
    if (sessionId) {
      const userId = await getUserIdForSession(sessionId);
      if (userId) {
        const user = await store.getUser(userId);
        if (user) {
          ctx.state.user = user;
          ctx.state.sessionId = sessionId;
          return ctx.next();
        }
      }
    }
  } catch {
    // OAuth env vars not configured (e.g. dev without Google credentials).
    // Fall through to the dev demo-user fallback below.
  }

  if (isDev && demoUser) {
    ctx.state.user = demoUser;
    return ctx.next();
  }

  if (path.startsWith("/api/")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Preserve the page they were trying to reach so /login can send them back
  // after sign-in (see routes/login.tsx).
  const next = `${ctx.url.pathname}${ctx.url.search}`;
  return ctx.redirect(`/login?next=${encodeURIComponent(next)}`);
});

export default authMiddleware;
