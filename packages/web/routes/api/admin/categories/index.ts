import { CategorySchema, nextId } from "@essayist/core";
import { Result, Schema } from "effect";
import { define } from "#/define.ts";
import { saveCategory } from "#/signals/categories.server.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const body = await ctx.req.json().catch(() => null);
    const parsed = Schema.decodeUnknownResult(CategorySchema)({
      ...body,
      id: nextId(),
    });
    if (Result.isFailure(parsed)) {
      return Response.json(
        { error: "Invalid category", detail: parsed.failure.message },
        { status: 400 },
      );
    }
    await saveCategory(parsed.success);
    return Response.json(parsed.success, { status: 201 });
  }),
};
