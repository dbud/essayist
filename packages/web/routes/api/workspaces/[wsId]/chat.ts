// Parked during the multipass rework. Chat was a PoC debug tool coupled to
// the review pass config; the original handler is kept below.

export const handler = {
  GET: () =>
    new Response("chat is parked during the multipass rework", {
      status: 404,
    }),
};

/*
import {
  createGrepTool,
  createListFilesTool,
  createReadFileTool,
  createWriteFileTool,
} from "@essayist/core";
import { define } from "@/define.ts";
import { ResolveAgentError, resolveAgent } from "@/utils/agent.ts";
import { streamModelResultSSE } from "@/utils/sse.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const url = new URL(ctx.req.url);
    const message = url.searchParams.get("message");

    if (!message) {
      return Response.json(
        { error: "Missing 'message' query parameter" },
        { status: 400 },
      );
    }

    try {
      const { agent, pass } = await resolveAgent(ctx.state.config);

      // Debug tool set (incl. write_file).
      const tools = [
        createReadFileTool(ctx.state.vfs),
        createListFilesTool(ctx.state.vfs),
        createGrepTool(ctx.state.vfs),
        createWriteFileTool(ctx.state.vfs),
      ];

      const input = `${pass.systemPrompt}\n\n${pass.instructions}\n\n${message}`;
      const modelResult = agent.callModelWithTools(
        input,
        tools,
        pass.modelRefs,
        pass.reviewPass.maxRounds,
      );
      return streamModelResultSSE(modelResult);
    } catch (e) {
      if (e instanceof ResolveAgentError) {
        return Response.json({ error: e.message }, { status: 500 });
      }
      throw e;
    }
  }),
};
*/
