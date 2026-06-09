import { define } from "@/define.ts";
import {
  createGrepTool,
  createListFilesTool,
  createReadFileTool,
  createWriteFileTool,
} from "@essayist/core";
import { streamModelResultSSE } from "@/utils/sse.ts";
import { vfs } from "@/vfs.ts";

const tools = [
  createReadFileTool(vfs),
  createListFilesTool(vfs),
  createGrepTool(vfs),
  createWriteFileTool(vfs),
];

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

    const result = ctx.state.agent.callModelWithTools(message, tools);
    const stream = streamModelResultSSE(result);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }),
};
