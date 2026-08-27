import { define } from "@/define.ts";
import { runRequest } from "@/signals/models.server.ts";

/**
 * Wraps every request in a fresh model-store scope (AsyncLocalStorage) so
 * server-side models and seeds are request-scoped and never leak across
 * concurrent requests. Must run before any route handler that seeds or
 * renders islands.
 */
export default define.middleware(async (ctx) => {
  return await runRequest(() => ctx.next());
});
