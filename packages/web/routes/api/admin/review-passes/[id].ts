import { ReviewConfig, ReviewPassSchema } from "@essayist/core";
import { define } from "@/define.ts";
import { runtime } from "@/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = ReviewPassSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid review pass", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await runtime.runPromise(
      ReviewConfig.use((store) => store.saveReviewPass(parsed.data)),
    );
    return Response.json(parsed.data);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    await runtime.runPromise(
      ReviewConfig.use((store) => store.deleteReviewPass(id)),
    );
    return Response.json({ ok: true });
  }),
};
