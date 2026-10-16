/**
 * The site session cookie and the middleware that resolves
 * `auth-user` per request.
 */

import type { User } from "@essayist/core";
import { AuthStore, Workspaces } from "@essayist/core";
import type { Context, MiddlewareHandler } from "hono";
import { generateCookie, getCookie } from "hono/cookie";
import { runtime } from "#/app/runtime.ts";
import { env } from "#/env.ts";

declare module "hono" {
  interface ContextVariableMap {
    "auth-session-id": string | undefined;
    "auth-user": User | undefined;
  }
}

// The store TTL is the lifetime authority; a cookie without a live
// session row resolves to no user.
const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

/** The cookie name: `__Host-` prefixed on https, plain otherwise. */
export function siteSessionCookieName(url: URL): string {
  return url.protocol === "https:" ? "__Host-site-session" : "site-session";
}

export function siteSessionCookie(
  url: URL,
  sessionId: string,
  maxAge: number = SESSION_TTL_SECONDS,
): string {
  return generateCookie(siteSessionCookieName(url), sessionId, {
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
    maxAge: maxAge,
  });
}

// An empty cookie with a zero age, the standard way to clear one.
export function expiredCookie(url: URL, name: string): string {
  return generateCookie(name, "", {
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
    maxAge: 0,
  });
}

export function readSiteSession(c: Context): string | undefined {
  return getCookie(c, siteSessionCookieName(new URL(c.req.url)));
}

/**
 * Resolves `auth-user` and `auth-session-id` from the site session
 * cookie when one is present. Does not enforce: routes decide how to
 * treat an anonymous request.
 */
export const resolveSession: MiddlewareHandler = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!path.startsWith("/oauth/") && path !== "/login") {
    const sessionId = readSiteSession(c);
    if (sessionId !== undefined) {
      const session = await runtime(env(c.env)).runPromise(
        AuthStore.use((store) => store.getSession(sessionId)),
      );
      if (session !== undefined) {
        const user = await runtime(env(c.env)).runPromise(
          Workspaces.use((store) => store.getUser(session.userId)),
        );
        if (user !== undefined) {
          c.set("auth-session-id", sessionId);
          c.set("auth-user", user);
        }
      }
    }
  }
  await next();
};
