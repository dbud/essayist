import { CategorySchema } from "@essayist/core";
import { define } from "@/define.ts";
import { deleteCategory, saveCategory } from "@/signals/categories.server.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = CategorySchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid category", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await saveCategory(parsed.data);
    return Response.json(parsed.data);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    await deleteCategory(id);
    return Response.json({ ok: true });
  }),
};
