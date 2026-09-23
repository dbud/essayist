import type { Middleware } from "fresh";
import { define, type State } from "@/define.ts";
import { Sentry } from "@/utils/sentry.server.ts";

const sentryMiddleware: Middleware<State> = define.middleware(async (ctx) => {
  return await Sentry.withIsolationScope(async (scope) => {
    scope.setTag("route", ctx.route ?? "unmatched");
    if (ctx.params.wsId) scope.setTag("ws_id", ctx.params.wsId);
    const userId = ctx.state.user?.id;
    if (userId) scope.setUser({ id: userId });

    try {
      return await ctx.next();
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  });
});

export default sentryMiddleware;
