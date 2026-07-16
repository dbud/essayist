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
 *  1. `X-User-Id` header (dev bypass for scripting / multi-user tests).
 *  2. Valid Google OAuth session cookie (see routes/oauth/*).
 *  3. The seeded demo user, in dev only.
 *  4. Otherwise unauthenticated: API routes get 401 JSON, browser routes
 *     redirect to /oauth/signin.
 *
 * The /oauth/* routes and /login page are skipped so sign-in / sign-out /
 * callback and the login page itself can run before a user is resolved.
 */
const authMiddleware: Middleware<State> = define.middleware(async (ctx) => {
  const path = ctx.url.pathname;
  if (path.startsWith("/oauth/") || path === "/login") {
    return ctx.next();
  }

  // TODO: remove after testing
  const headerId = ctx.req.headers.get("X-User-Id");
  if (headerId) {
    const user = await store.getUser(headerId);
    if (!user) {
      return Response.json({ error: "Unknown user" }, { status: 401 });
    }
    ctx.state.user = user;
    return ctx.next();
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
  return ctx.redirect("/login");
});

export default authMiddleware;
