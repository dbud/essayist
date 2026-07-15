import { define } from "@/define.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { path } = ctx.params;
    const result = await ctx.state.vfs.read(decodeURIComponent(path));
    return Response.json(result);
  }),
};
