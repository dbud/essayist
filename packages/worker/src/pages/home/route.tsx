import { Hono } from "hono";
import { renderDocument } from "#/app/render.tsx";
import { runtime } from "#/app/runtime.ts";
import { env } from "#/env.ts";
import loader from "./loader";
import createModels from "./models";
import page from "./page";

export default new Hono().get("/", async (c) => {
  const data = await runtime(env(c.env)).runPromise(loader);
  return c.html(
    renderDocument("essayist prototype", page(createModels(data)), {
      client: "home",
      pageData: data,
    }),
  );
});
