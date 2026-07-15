import {
  createGrepTool,
  createListFilesTool,
  createReadFileTool,
  createWriteFileTool,
} from "@essayist/core";
import { define } from "@/define.ts";
import { streamModelResultSSE } from "@/utils/sse.ts";

export const handler = {
  GET: define.handlers((ctx) => {
    const url = new URL(ctx.req.url);
    const message = url.searchParams.get("message");

    if (!message) {
      return Response.json(
        { error: "Missing 'message' query parameter" },
        { status: 400 },
      );
    }

    // Build tools per request against the resolved workspace VFS.
    const tools = [
      createReadFileTool(ctx.state.vfs),
      createListFilesTool(ctx.state.vfs),
      createGrepTool(ctx.state.vfs),
      createWriteFileTool(ctx.state.vfs),
    ];

    const result = ctx.state.agent.callModelWithTools(message, tools);
    const stream = streamModelResultSSE(result);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }),
};
