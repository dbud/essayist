import { App, staticFiles } from "fresh";
import type { State } from "@/define.ts";
import { agentMiddleware } from "@/middleware/agent.ts";

export const app = new App<State>().use(staticFiles()).use(agentMiddleware);

app.fsRoutes();

if (import.meta.main) {
  await app.listen();
}
