// Worker entry: /api/* goes to the api tier; everything else to the pages tier.
import { Hono } from "hono";
import { apiHandler } from "./api/votes";
import { webApp } from "./app/hono";

const app = new Hono();

app.all("/api/*", (c) => apiHandler(c.req.raw));
app.route("/", webApp);

export default app;
