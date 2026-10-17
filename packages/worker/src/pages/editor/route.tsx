import { Hono } from "hono";
import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";
import { workspacesLoader } from "#/workspaces/loader.ts";
import createModels, { EditorModelsProvider } from "./models";
import Page from "./page";

export default new Hono().get("/", async (c) => {
  const user = c.get("auth-user");
  if (user === undefined) return c.redirect("/", 303);

  const workspaces = await runtime(env(c.env)).runPromise(
    workspacesLoader(user.id, c.req.query("ws")),
  );
  return c.render(
    <EditorModelsProvider value={createModels({ workspaces })}>
      <Page />
    </EditorModelsProvider>,
    {
      title: "editor",
      client: "editor",
      data: { workspaces },
    },
  );
});
