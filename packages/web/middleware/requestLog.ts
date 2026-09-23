import { logger } from "@essayist/core";
import { HttpError, type Middleware } from "fresh";
import { define, type State } from "@/define.ts";

const requestLogMiddleware: Middleware<State> = define.middleware(
  async (ctx) => {
    const start = performance.now();
    const fields = () => ({
      method: ctx.req.method,
      route: ctx.route ?? ctx.url.pathname,
      duration_ms: Math.round(performance.now() - start),
    });
    try {
      const res = await ctx.next();
      logger.info({ ...fields(), status: res.status }, "request");
      return res;
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      logger.error({ ...fields(), status }, "request");
      throw error;
    }
  },
);

export default requestLogMiddleware;
