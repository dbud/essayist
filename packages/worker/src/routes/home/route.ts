import { Hono } from "hono";
import { renderDocument } from "@/app/render";
import { runLoader } from "@/app/runtime";
import { homeLoader } from "./loader";
import { homePage } from "./page";

export const homeRoute = new Hono().get("/", async (c) => {
  const data = await runLoader(homeLoader);
  return c.html(
    renderDocument("essayist prototype", homePage(data), {
      client: "home",
      pageData: data,
    }),
  );
});
