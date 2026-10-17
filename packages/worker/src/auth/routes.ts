/**
 * The Google OAuth routes: `/oauth/google` starts the sign-in and
 * receives the callback (the @hono/oauth-providers middleware redirects
 * entry requests and handles the callback when `code` is present) and
 * `/oauth/signout` deletes the session.
 */

import { AuthStore, nextId, type SessionTokens } from "@essayist/core";
import { googleAuth } from "@hono/oauth-providers/google";
import { Clock, Effect } from "effect";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { safeNext } from "#/auth/nextUrl.ts";
import {
  expiredCookie,
  readSiteSession,
  siteSessionCookie,
  siteSessionCookieName,
} from "#/auth/session.ts";
import { resolveGoogleUser } from "#/auth/user.ts";
import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";

// `drive.file` grants access only to files the user explicitly picks in
// the app, never their whole Drive.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
];

// The @hono middleware passes no parameters to the callback, so a
// short-lived cookie carries the post-sign-in redirect target.
const NEXT_COOKIE = "oauth-next";
const NEXT_COOKIE_MAX_AGE = 600;

const notConfigured = (
  client_id: string | undefined,
  client_secret: string | undefined,
): boolean => client_id === undefined || client_secret === undefined;

export const oauthRoutes = new Hono()
  .get("/signout", async (c) => {
    const sessionId = readSiteSession(c);
    if (sessionId !== undefined) {
      await runtime(env(c.env)).runPromise(
        AuthStore.use((store) => store.deleteSession(sessionId)),
      );
    }
    const response = c.redirect("/login?signedout=1", 303);
    const url = new URL(c.req.url);
    response.headers.append(
      "Set-Cookie",
      expiredCookie(url, siteSessionCookieName(url)),
    );
    return response;
  })
  .use("/google", (c, next) => {
    const target = c.req.query("next");
    if (target !== undefined) {
      setCookie(c, NEXT_COOKIE, safeNext(target), {
        path: "/",
        httpOnly: true,
        secure: new URL(c.req.url).protocol === "https:",
        maxAge: NEXT_COOKIE_MAX_AGE,
      });
    }
    return next();
  })
  .use("/google", async (c, next) => {
    const e = env(c.env);
    if (notConfigured(e.googleClientId, e.googleClientSecret)) {
      return c.text(
        "Google sign-in is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        500,
      );
    }
    return googleAuth({
      client_id: e.googleClientId,
      client_secret: e.googleClientSecret,
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    })(c, next);
  })
  .get("/google", async (c) => {
    // Without `code` the middleware redirects; reaching the handler
    // means a state-validated callback.
    const token = c.get("token");
    const googleUser = c.get("user-google");
    const next = safeNext(getCookie(c, NEXT_COOKIE) ?? null);

    if (token === undefined || googleUser?.email === undefined) {
      return c.text("the Google sign-in callback is missing a token", 500);
    }
    const { email, name, picture } = googleUser;

    const sessionId = await runtime(env(c.env)).runPromise(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const user = yield* resolveGoogleUser({
          email: email,
          name: name,
          picture: picture,
        });
        const tokens: SessionTokens = {
          accessToken: token.token,
          tokenType: undefined,
          expiresIn: token.expires_in,
          refreshToken: c.get("refresh-token")?.token,
          expiresAt: now + (token.expires_in ?? 3600) * 1000,
        };
        const id = nextId();
        const auth = yield* AuthStore;
        yield* auth.createSession(id, user.id, tokens);
        if (tokens.refreshToken !== undefined) {
          yield* auth.setRefreshToken(user.id, tokens.refreshToken);
        }
        return id;
      }),
    );

    const response = c.redirect(next, 303);
    response.headers.append(
      "Set-Cookie",
      siteSessionCookie(new URL(c.req.url), sessionId),
    );
    response.headers.append(
      "Set-Cookie",
      expiredCookie(new URL(c.req.url), NEXT_COOKIE),
    );
    return response;
  });
