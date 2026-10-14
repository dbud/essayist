// Worker entry (ESS-79). API tier first: /api/* goes to the effect http-api
// prototype; everything else to the pages tier. Static assets and middleware
// port with the first real features.
import { Hono } from "hono";
import { apiHandler } from "./api/hello";
import { webApp } from "./app/hono";

const app = new Hono();

app.all("/api/*", (c) => apiHandler(c.req.raw));
app.route("/", webApp);

export default app;
