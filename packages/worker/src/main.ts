import { USER_ROLES } from "@essayist/core";
import { Hono } from "hono";
import { SMOKE } from "./smoke";

// Target app skeleton: Fresh keeps serving Deno Deploy until cutover, and
// features migrate here one route folder at a time (ESS-79, ESS-80).
// Worker-side modules use relative imports; "@/..." is an alias for core's
// internal imports until the toolchain cutover (ESS-89).
const app = new Hono();

app.get("/", (c) =>
  c.text(`${SMOKE}: ${USER_ROLES.join(", ")} roles loaded from @essayist/core`),
);

export default app;
