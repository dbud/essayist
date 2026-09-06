import { define } from "@/define.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const path = decodeURIComponent(ctx.params.path);
    const checkpoint = await ctx.state.vfs.read(path);
    const draft = await ctx.state.vfs.readDraft(path);
    return Response.json({ checkpoint, draft });
  }),

  // Create-only. Returns 409 if the file already exists; use PUT to upsert.
  POST: define.handlers(async (ctx) => {
    const filePath = decodeURIComponent(ctx.params.path);
    if (!filePath.trim()) {
      return Response.json({ error: "Missing 'path'" }, { status: 400 });
    }

    const existing = (await ctx.state.vfs.list(filePath)).some(
      (f) => f.path === filePath,
    );
    if (existing) {
      return Response.json({ error: "File already exists" }, { status: 409 });
    }

    const body = (await ctx.req.json().catch(() => null)) as {
      content?: string;
    } | null;
    const content = body?.content ?? "";
    const result = await ctx.state.vfs.write(filePath, content);
    return Response.json(result, { status: 201 });
  }),

  // Upsert: creates the file or overwrites it with a new version.
  PUT: define.handlers(async (ctx) => {
    const filePath = decodeURIComponent(ctx.params.path);
    if (!filePath.trim()) {
      return Response.json({ error: "Missing 'path'" }, { status: 400 });
    }

    const body = (await ctx.req.json().catch(() => null)) as {
      content?: string;
    } | null;
    const content = body?.content ?? "";
    const result = await ctx.state.vfs.write(filePath, content);
    return Response.json(result, { status: result.created ? 201 : 200 });
  }),
};
