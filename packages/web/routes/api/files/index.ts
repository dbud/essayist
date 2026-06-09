import { define } from "@/define.ts";
import { vfs } from "@/vfs.ts";

export const handler = {
  GET: define.handlers((_ctx) => {
    const files = vfs.list();
    return Response.json(files);
  }),
};
