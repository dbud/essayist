import { CategorySchema } from "@essayist/core";
import { Result, Schema } from "effect";
import { define } from "@/define.ts";
import { deleteCategory, saveCategory } from "@/signals/categories.server.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = Schema.decodeUnknownResult(CategorySchema)({ ...body, id });
    if (Result.isFailure(parsed)) {
      return Response.json(
        { error: "Invalid category", detail: parsed.failure.message },
        { status: 400 },
      );
    }
    await saveCategory(parsed.success);
    return Response.json(parsed.success);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    await deleteCategory(id);
    return Response.json({ ok: true });
  }),
};
