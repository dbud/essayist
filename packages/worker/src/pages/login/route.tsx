import { Hono } from "hono";
import { safeNext } from "#/auth/nextUrl.ts";
import { env } from "#/env.ts";
import Page from "./page";

export default new Hono().get("/", (c) => {
  const next = safeNext(c.req.query("next") ?? null);
  const { googleClientId } = env(c.env);
  return c.render(<Page googleClientId={googleClientId} next={next} />, {
    title: "Sign in",
    client: "login",
    data: { googleClientId, next },
  });
});
