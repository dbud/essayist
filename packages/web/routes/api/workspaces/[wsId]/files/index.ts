import { define } from "@/define.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const files = await ctx.state.vfs.list();
    return Response.json(files);
  }),
};
