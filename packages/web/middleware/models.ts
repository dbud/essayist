import type { Middleware } from "fresh";
import { define, type State } from "@/define.ts";
import { runRequest } from "@/signals/models.server.ts";

/** Each request runs in a fresh model scope. */
const modelsMiddleware: Middleware<State> = define.middleware((ctx) =>
  runRequest(() => ctx.next()),
);

export default modelsMiddleware;
