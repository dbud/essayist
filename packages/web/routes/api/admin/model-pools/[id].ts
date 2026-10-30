import { ModelPoolSchema, ReviewConfig } from "@essayist/core";
import { Result, Schema } from "effect";
import { define } from "#/define.ts";
import { runtime } from "#/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = Schema.decodeUnknownResult(ModelPoolSchema)({ ...body, id });
    if (Result.isFailure(parsed)) {
      return Response.json(
        { error: "Invalid model pool", detail: parsed.failure.message },
        { status: 400 },
      );
    }
    await runtime.runPromise(
      ReviewConfig.use((store) => store.saveModelPool(parsed.success)),
    );
    return Response.json(parsed.success);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    await runtime.runPromise(
      ReviewConfig.use((store) => store.deleteModelPool(id)),
    );
    return Response.json({ ok: true });
  }),
};
