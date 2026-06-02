import { App, staticFiles } from "fresh";
import { agentMiddleware } from "./middleware/agent.ts";
import type { State } from "./utils.ts";

export const app = new App<State>()
  .use(staticFiles())
  .use(agentMiddleware);

app.fsRoutes();

if (import.meta.main) {
  await app.listen();
}
