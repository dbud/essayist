import { Effect, Schema } from "effect";
import { Hono } from "hono";

import { encodeUser } from "#/auth/user.ts";
import { env } from "#/env.ts";
import { categoriesLoader } from "#/models/categories.loader.ts";
import { fileTreesLoader } from "#/models/fileTrees.loader.ts";
import { fileViewLoader } from "#/models/fileView.loader.ts";
import { reviewRunsLoader } from "#/models/reviewRuns.loader.ts";
import { workspacesLoader } from "#/models/workspaces.loader.ts";
import { runtime } from "#/runtime.ts";

import { EditorData } from "./data.ts";
import createModels, { EditorModelsProvider } from "./models";
import Page from "./page";

// the URL names the workspace, the file by its path and the version by its seq; an unknown one
// falls back to the last opened workspace and file, and to the latest version
export default new Hono<{ Bindings: Cloudflare.Env }>().get("/", async (c) => {
  const user = c.get("auth-user");
  if (user === undefined) return c.redirect("/", 303);
  const version = c.req.query("version");
  const seq = version !== undefined && /^[1-9]\d*$/.test(version) ? Number(version) : undefined;

  const seed = Effect.gen(function* () {
    const workspaces = yield* workspacesLoader(user.id, c.req.query("ws"));
    const fileTrees = yield* fileTreesLoader(
      user.id,
      workspaces.selectedId,
      c.req.query("path"),
      seq,
    );
    const fileView =
      fileTrees.wsId === null || fileTrees.tree?.selectedFileId == null
        ? null
        : yield* fileViewLoader(
            fileTrees.wsId,
            fileTrees.tree.selectedFileId,
            fileTrees.tree.selectedVersionId,
          );
    const reviewRuns =
      fileTrees.wsId === null || fileTrees.tree?.selectedFileId == null
        ? null
        : yield* reviewRunsLoader(fileTrees.wsId, fileTrees.tree.selectedFileId);
    const categories = yield* categoriesLoader();
    return {
      workspaces,
      fileTrees,
      fileView,
      reviewRuns,
      categories,
    };
  });
  const data = await runtime(env(c.env)).runPromise(
    seed.pipe(Effect.flatMap(Schema.encodeEffect(EditorData)), Effect.orDie),
  );
  return c.render(
    <EditorModelsProvider value={createModels(data, encodeUser(user))}>
      <Page />
    </EditorModelsProvider>,
    {
      title: "editor",
      client: "editor",
      data,
    },
  );
});
