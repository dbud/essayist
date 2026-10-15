import { ReviewConfig, ReviewPassSchema } from "@essayist/core";
import { Result, Schema } from "effect";
import { define } from "#/define.ts";
import { runtime } from "#/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = Schema.decodeUnknownResult(ReviewPassSchema)({
      ...body,
      id,
    });
    if (Result.isFailure(parsed)) {
      return Response.json(
        { error: "Invalid review pass", detail: parsed.failure.message },
        { status: 400 },
      );
    }
    await runtime.runPromise(
      ReviewConfig.use((store) => store.saveReviewPass(parsed.success)),
    );
    return Response.json(parsed.success);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    await runtime.runPromise(
      ReviewConfig.use((store) => store.deleteReviewPass(id)),
    );
    return Response.json({ ok: true });
  }),
};
