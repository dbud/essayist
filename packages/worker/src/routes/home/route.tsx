import { Hono } from "hono";
import { renderDocument } from "#/app/render.tsx";
import { runLoader } from "#/app/runtime.ts";
import { env } from "#/env.ts";
import { homeLoader } from "./loader";
import { createHomeModels } from "./models";
import { HomeTree } from "./page";

export const homeRoute = new Hono().get("/", async (c) => {
  const data = await runLoader(homeLoader, env(c.env));
  return c.html(
    renderDocument("essayist prototype", HomeTree(createHomeModels(data)), {
      client: "home",
      pageData: data,
    }),
  );
});
