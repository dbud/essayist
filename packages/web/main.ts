import { App, staticFiles } from "fresh";
import type { State } from "@/define.ts";
import authMiddleware from "@/middleware/auth.ts";

export const app: App<State> = new App<State>()
  .use(staticFiles())
  .use(authMiddleware);

app.fsRoutes();

if (import.meta.main) {
  await app.listen();
}
