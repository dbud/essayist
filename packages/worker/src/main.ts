import { Hono } from "hono";

import { env } from "#/env.ts";

import { apiHandler } from "./api/handler.ts";
import { streamRoutes } from "./api/streams.ts";
import { webApp } from "./app/hono.ts";
import { scheduled } from "./scheduled.ts";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.route("/api/streams", streamRoutes);
app.all("/api/*", (c) => apiHandler(c.req.raw, env(c.env)));
app.route("/", webApp);

export { ReviewRunDriver } from "#/reviews/driver.ts";

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<Cloudflare.Env>;
