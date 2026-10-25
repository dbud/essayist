// The session middleware for HttpApi groups; resolves the site session
// like the pages middleware and provides UserSession to handlers.
import { AuthStore, type User, Workspaces } from "@essayist/core";
import { Context, Effect, Layer } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { HttpApiError, HttpApiMiddleware } from "effect/http-api";
import { DEV_SESSION_ID, DEV_USER_HEADER } from "#/auth/devUser.ts";
import { siteSessionCookieName } from "#/auth/session.ts";

export interface UserSessionProps {
  readonly user: User;
  readonly sessionId: string;
}

export class UserSession extends Context.Service<
  UserSession,
  UserSessionProps
>()("@essayist/worker/api/UserSession") {}

export class SessionMiddleware extends HttpApiMiddleware.Service<
  SessionMiddleware,
  {
    readonly requires: AuthStore | Workspaces;
    readonly provides: UserSession;
  }
>()("api/Session", { error: HttpApiError.Unauthorized }) {}

// Persistence faults are defects: no api contract covers them, so the
// middleware dies and the tier answers 500.
export const sessionMiddleware: Layer.Layer<
  SessionMiddleware,
  never,
  AuthStore | Workspaces
> = Layer.succeed(SessionMiddleware, (httpEffect) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;

    if (import.meta.env.DEV) {
      const email = request.headers[DEV_USER_HEADER]?.trim();
      if (email !== undefined) {
        const devUser = yield* Workspaces.use((store) =>
          store.getUserByEmail(email),
        ).pipe(Effect.orDie);
        if (devUser !== undefined) {
          return yield* Effect.provideService(httpEffect, UserSession, {
            user: devUser,
            sessionId: DEV_SESSION_ID,
          });
        }
      }
    }

    const sessionId =
      request.cookies[siteSessionCookieName(new URL(request.originalUrl))];
    if (sessionId === undefined) {
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }
    const session = yield* AuthStore.use((store) =>
      store.getSession(sessionId),
    ).pipe(Effect.orDie);
    if (session === undefined) {
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }
    const user = yield* Workspaces.use((store) =>
      store.getUser(session.userId),
    ).pipe(Effect.orDie);
    if (user === undefined) {
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }
    return yield* Effect.provideService(httpEffect, UserSession, {
      user,
      sessionId,
    });
  }),
);
