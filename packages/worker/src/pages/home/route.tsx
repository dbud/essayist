import { Hono } from "hono";
import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";
import loader from "./loader";
import createModels, { HomeModelsProvider } from "./models";
import Page from "./page";

export default new Hono().get("/", async (c) => {
  const data = await runtime(env(c.env)).runPromise(loader);
  return c.render(
    <HomeModelsProvider value={createModels(data)}>
      <Page />
    </HomeModelsProvider>,
    {
      title: "essayist",
    },
  );
});
