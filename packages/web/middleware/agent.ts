import { Agent } from "@essayist/core";
import type { Middleware } from "fresh";
import { define, type State } from "@/define.ts";

const agentMiddleware: Middleware<State> = define.middleware(async (ctx) => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY not configured" },
      { status: 500 },
    );
  }

  ctx.state.agent = new Agent(apiKey);
  return await ctx.next();
});

export default agentMiddleware;
