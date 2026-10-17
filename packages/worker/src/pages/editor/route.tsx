import { Effect } from "effect";
import { Hono } from "hono";
import { env } from "#/env.ts";
import { fileTreeLoader } from "#/models/fileTree.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";
import { runtime } from "#/runtime.ts";
import createModels, { EditorModelsProvider } from "./models";
import Page from "./page";

export default new Hono().get("/", async (c) => {
  const user = c.get("auth-user");
  if (user === undefined) return c.redirect("/", 303);

  const seed = Effect.gen(function* () {
    const workspaces = yield* workspacesLoader(user.id, c.req.query("wsId"));
    const fileTree =
      workspaces.selectedId === null
        ? null
        : yield* fileTreeLoader(
            user.id,
            workspaces.selectedId,
            c.req.query("path"),
          );
    return { workspaces, fileTree };
  });
  const data = await runtime(env(c.env)).runPromise(seed);
  return c.render(
    <EditorModelsProvider value={createModels(data)}>
      <Page />
    </EditorModelsProvider>,
    {
      title: "editor",
      client: "editor",
      data,
    },
  );
});
