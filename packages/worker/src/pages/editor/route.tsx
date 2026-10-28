import { Effect } from "effect";
import { Hono } from "hono";

import { env } from "#/env.ts";
import { categoriesLoader } from "#/models/categories.loader.ts";
import { fileTreesLoader } from "#/models/fileTrees.loader.ts";
import { fileViewLoader } from "#/models/fileView.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";
import { runtime } from "#/runtime.ts";

import createModels, { EditorModelsProvider } from "./models";
import Page from "./page";

export default new Hono().get("/", async (c) => {
  const user = c.get("auth-user");
  if (user === undefined) return c.redirect("/", 303);

  const seed = Effect.gen(function* () {
    const workspaces = yield* workspacesLoader(user.id, c.req.query("wsId"));
    const fileTrees = yield* fileTreesLoader(
      user.id,
      workspaces.selectedId,
      c.req.query("path"),
      c.req.query("versionId"),
    );
    const fileView =
      fileTrees.wsId === null || fileTrees.tree?.selectedPath == null
        ? null
        : yield* fileViewLoader(
            fileTrees.wsId,
            fileTrees.tree.selectedPath,
            fileTrees.tree.selectedVersionId,
          );
    const categories = yield* categoriesLoader();
    return {
      workspaces,
      fileTrees,
      fileView,
      categories,
    };
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
