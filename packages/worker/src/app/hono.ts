import { inspect } from "node:util";
import { Hono } from "hono";
import { oauthRoutes } from "#/auth/routes.ts";
import { resolveSession } from "#/auth/session.ts";
import { pages } from "#/pages/index.ts";

export const webApp = new Hono()
  .onError((error, c) => {
    console.error(inspect(error, { depth: 8 }));
    return c.text("internal error", 500);
  })
  .use("*", resolveSession)
  .route("/oauth", oauthRoutes);

for (const [path, route] of Object.entries(pages)) {
  webApp.route(path, route);
}
