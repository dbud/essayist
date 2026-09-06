import { define } from "@/define.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const path = decodeURIComponent(ctx.params.path);
    const body = (await ctx.req.json().catch(() => null)) as {
      content?: string;
    } | null;
    if (!body || typeof body.content !== "string") {
      return Response.json({ error: "Missing 'content'" }, { status: 400 });
    }

    return Response.json(await ctx.state.vfs.writeDraft(path, body.content));
  }),
};
