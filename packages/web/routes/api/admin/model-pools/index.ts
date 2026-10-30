import { ModelPoolSchema, nextId, ReviewConfig } from "@essayist/core";
import { Result, Schema } from "effect";
import { define } from "#/define.ts";
import { runtime } from "#/store.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const body = await ctx.req.json().catch(() => null);
    const parsed = Schema.decodeUnknownResult(ModelPoolSchema)({
      ...body,
      id: nextId(),
    });
    if (Result.isFailure(parsed)) {
      return Response.json(
        { error: "Invalid model pool", detail: parsed.failure.message },
        { status: 400 },
      );
    }
    await runtime.runPromise(
      ReviewConfig.use((store) => store.saveModelPool(parsed.success)),
    );
    return Response.json(parsed.success, { status: 201 });
  }),
};
