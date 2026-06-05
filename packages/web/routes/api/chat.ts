import { define } from "../../utils.ts";
import { createReadFileTool } from "@essayist/core";

const sampleFiles = new Map<string, string>([
  [
    "essay.txt",
    "The quick brown fox jumps over the lazy dog. " +
    "This sentence contains every letter of the alphabet.",
  ],
  [
    "report.txt",
    "Q3 revenue grew 12% year-over-year. " +
    "Operating margins improved due to cost optimization.",
  ],
]);

const tools = [createReadFileTool(sampleFiles)];

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

    const stream = ctx.state.agent.streamChatSSE(message, tools);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }),
};
