import { Hono } from "hono";
import { env } from "#/env.ts";
import { categoriesLoader } from "#/models/categories.loader.ts";
import { runtime } from "#/runtime.ts";
import createModels, { HomeModelsProvider } from "./models";
import Page from "./page";

export default new Hono().get("/", async (c) => {
  const data = {
    categories: await runtime(env(c.env)).runPromise(categoriesLoader()),
  };
  return c.render(
    <HomeModelsProvider value={createModels(data)}>
      <Page />
    </HomeModelsProvider>,
    {
      title: "essayist",
    },
  );
});
