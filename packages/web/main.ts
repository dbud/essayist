import { App, staticFiles } from "fresh";
import type { State } from "@/define.ts";
import agentMiddleware from "@/middleware/agent.ts";
import authMiddleware from "@/middleware/auth.ts";

export const app = new App<State>()
  .use(staticFiles())
  .use(agentMiddleware)
  .use(authMiddleware);

app.fsRoutes();

if (import.meta.main) {
  await app.listen();
}
