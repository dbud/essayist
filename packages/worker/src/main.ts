import { Hono } from "hono";

import { env } from "#/env.ts";

import { apiHandler } from "./api/handler.ts";
import { webApp } from "./app/hono";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.all("/api/*", (c) => apiHandler(c.req.raw, env(c.env)));
app.route("/", webApp);

export default app;
