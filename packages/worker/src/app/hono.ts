// Pages tier: SSR pages and middleware mount here.

import { inspect } from "node:util";
import { Hono } from "hono";
import { homeRoute } from "#/routes/home/route.tsx";

export const webApp = new Hono();

// Keep loader failures out of the node default printer, which truncates
// nested causes at depth 2; log the whole chain and answer a plain 500.
webApp.onError((error, c) => {
  console.error(inspect(error, { depth: 8 }));
  return c.text("internal error", 500);
});

webApp.route("/", homeRoute);
