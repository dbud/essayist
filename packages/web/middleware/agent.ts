import { Agent } from "@essayist/core";
import { define } from "@/define.ts";

export const agentMiddleware = define.middleware(async (ctx) => {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return Response.json(
      { error: "OPENROUTER_API_KEY not configured" },
      {
        status: 500,
      },
    );
  }

  ctx.state.agent = new Agent(apiKey);
  return await ctx.next();
});
