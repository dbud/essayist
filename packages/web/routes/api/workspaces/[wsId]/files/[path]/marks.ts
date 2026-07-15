import { define } from "@/define.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { path } = ctx.params;
    const decodedPath = decodeURIComponent(path);
    const latest = await ctx.state.vfs.read(decodedPath);
    if (!latest.version_id) {
      return Response.json([]);
    }
    const marks = await ctx.state.vfs.getMarks(decodedPath, latest.version_id);
    return Response.json(marks);
  }),
};
