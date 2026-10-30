import { Effect } from "effect";
import { HttpError, type Middleware } from "fresh";
import { define, type State } from "#/define.ts";
import { runtime } from "#/store.ts";

/** Query params that carry a credential rather than data. */
const SECRET_PARAMS = new Set([
  "access_token",
  "code",
  "key",
  "secret",
  "token",
]);

const requestLogMiddleware: Middleware<State> = define.middleware(
  async (ctx) => {
    const start = performance.now();
    const fields = () => ({
      method: ctx.req.method,
      route: ctx.route ?? ctx.url.pathname,
      params: ctx.params,
      query: Object.fromEntries(
        [...ctx.url.searchParams].map(([key, value]) => [
          key,
          SECRET_PARAMS.has(key) ? "[REDACTED]" : value,
        ]),
      ),
      duration_ms: Math.round(performance.now() - start),
    });
    try {
      const res = await ctx.next();
      runtime.runFork(
        Effect.logInfo("request", { ...fields(), status: res.status }),
      );
      return res;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      runtime.runFork(Effect.logError("request", { ...fields(), status }));
      throw error;
    }
  },
);

export default requestLogMiddleware;
