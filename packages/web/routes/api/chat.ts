import { define } from "../../utils.ts";
import {
  createGrepTool,
  createListFilesTool,
  createReadFileTool,
  createWriteFileTool,
  InMemoryAdapter,
  VirtualFileSystem,
} from "@essayist/core";
import { streamModelResultSSE } from "@/utils/sse.ts";

const adapter = new InMemoryAdapter();
const vfs = new VirtualFileSystem(adapter);

vfs.write(
  "essay.txt",
  "The quick brown fox jumps over the lazy dog.\n" +
    "This sentence contains every letter of the alphabet.\n" +
    "It has been used as a typing test since the late 1800s.",
);

vfs.write(
  "report.txt",
  "Q3 revenue grew 12% year-over-year.\n" +
    "Operating margins improved due to cost optimization.\n" +
    "Customer acquisition cost decreased by 8%.",
);

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
