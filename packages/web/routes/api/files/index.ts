import { define } from "@/define.ts";
import { vfs } from "@/vfs.ts";

export const handler = {
  GET: define.handlers(async (_ctx) => {
    const files = await vfs.list();
    return Response.json(files);
  }),
};
