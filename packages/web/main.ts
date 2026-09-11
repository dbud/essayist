import { App, staticFiles } from "fresh";
import type { State } from "@/define.ts";
import authMiddleware from "@/middleware/auth.ts";
import modelsMiddleware from "@/middleware/models.ts";
import "@/signals/categories.server.ts";
import "@/signals/fileTree.server.ts";
import "@/signals/file.server.ts";
import "@/signals/workspace.server.ts";

export const app: App<State> = new App<State>()
  .use(staticFiles())
  .use(authMiddleware)
  .use(modelsMiddleware);

app.fsRoutes();

if (import.meta.main) {
  await app.listen();
}
