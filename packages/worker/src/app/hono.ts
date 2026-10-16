// Pages tier: SSR pages and middleware mount here.

import { inspect } from "node:util";
import { Hono } from "hono";
import { resolveSession } from "#/auth/session.ts";
import { homeRoute } from "#/routes/home/route.tsx";
import { loginRoute } from "#/routes/login/route.tsx";
import { oauthRoute } from "#/routes/oauth/route.ts";

export const webApp = new Hono()
  // Keep loader failures out of the node default printer, which
  // truncates nested causes at depth 2; log the whole chain and answer
  // a plain 500.
  .onError((error, c) => {
    console.error(inspect(error, { depth: 8 }));
    return c.text("internal error", 500);
  })
  .use("*", resolveSession)
  .route("/oauth", oauthRoute)
  .route("/login", loginRoute)
  .route("/", homeRoute);
