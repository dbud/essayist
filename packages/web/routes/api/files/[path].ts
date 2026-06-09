import { define } from "@/define.ts";
import { vfs } from "@/vfs.ts";

export const handler = {
  GET: define.handlers((ctx) => {
    const { path } = ctx.params;
    const result = vfs.read(decodeURIComponent(path));
    return Response.json(result);
  }),
};
