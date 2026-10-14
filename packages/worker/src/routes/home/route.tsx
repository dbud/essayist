import { Hono } from "hono";
import { renderDocument } from "@/app/render";
import { runLoader } from "@/app/runtime";
import { homeLoader } from "./loader";
import { createHomeModels } from "./models";
import { HomeTree } from "./page";

export const homeRoute = new Hono().get("/", async (c) => {
  const data = await runLoader(homeLoader);
  return c.html(
    renderDocument("essayist prototype", HomeTree(createHomeModels(data)), {
      client: "home",
      pageData: data,
    }),
  );
});
