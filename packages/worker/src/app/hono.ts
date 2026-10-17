import { inspect } from "node:util";
import { Hono } from "hono";
import { pageRenderer } from "#/app/render.tsx";
import { oauthRoutes } from "#/auth/routes.ts";
import { requireUser, resolveSession } from "#/auth/session.ts";
import { pages } from "#/pages/index.ts";

export const webApp = new Hono()
  .onError((error, c) => {
    console.error(inspect(error, { depth: 8 }));
    return c.text("internal error", 500);
  })
  .use("*", resolveSession)
  .use("*", requireUser)
  .use("*", pageRenderer)
  .route("/oauth", oauthRoutes);

for (const [path, route] of Object.entries(pages)) {
  webApp.route(path, route);
}
