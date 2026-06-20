import { define } from "@/define.ts";
import { vfs } from "@/vfs.ts";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const { path } = ctx.params;
    const decodedPath = decodeURIComponent(path);
    const latest = await vfs.read(decodedPath);
    if (!latest.version_id) {
      return Response.json([]);
    }
    const marks = await vfs.getMarks(decodedPath, latest.version_id);
    return Response.json(marks);
  }),
};
