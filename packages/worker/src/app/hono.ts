import { jsonLogLayer } from "@essayist/core";
import { captureException } from "@sentry/cloudflare";
import { Effect } from "effect";
import { Hono } from "hono";

import { pageRenderer } from "#/app/render.tsx";
import { oauthRoutes } from "#/auth/routes.ts";
import { requireUser, resolveSession } from "#/auth/session.ts";
import { pages } from "#/pages/index.ts";

export const webApp = new Hono()
  .onError((error, c) => {
    Effect.runFork(
      Effect.logError("page handler failed", {
        message: error instanceof Error ? error.message : String(error),
      }).pipe(Effect.provide(jsonLogLayer)),
    );
    captureException(error);
    return c.text("internal error", 500);
  })
  .use("*", resolveSession)
  .use("*", requireUser)
  .use("*", pageRenderer)
  .route("/oauth", oauthRoutes);

for (const [path, route] of Object.entries(pages)) {
  webApp.route(path, route);
}
