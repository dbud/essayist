import { Hono } from "hono";

import { env } from "#/env.ts";
import { adminConfigLoader } from "#/models/admin.loader.ts";
import { runtime } from "#/runtime.ts";

import createModels, { AdminModelsProvider } from "./models";
import Page from "./page";

export default new Hono().get("/", async (c) => {
  const user = c.get("auth-user");
  if (user?.role !== "admin") {
    return c.redirect("/", 303);
  }
  const data = await runtime(env(c.env)).runPromise(adminConfigLoader());
  return c.render(
    <AdminModelsProvider value={createModels(data)}>
      <Page />
    </AdminModelsProvider>,
    {
      title: "control panel",
      client: "admin",
      data,
    },
  );
});
