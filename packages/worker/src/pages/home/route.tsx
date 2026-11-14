import { Hono } from "hono";

import Page from "./page";

export default new Hono<{ Bindings: Cloudflare.Env }>().get("/", (c) =>
  c.render(<Page />, {
    title: "essayist",
    client: "home",
    data: {},
  }),
);
