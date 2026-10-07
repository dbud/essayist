import { ReviewConfig } from "@essayist/core";
import { define } from "@/define.ts";
import { runtime } from "@/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const body = (await ctx.req.json().catch(() => null)) as {
      reviewPassId?: string;
    } | null;
    const reviewPassId = body?.reviewPassId?.trim();
    if (!reviewPassId) {
      return Response.json(
        { error: "Missing 'reviewPassId'" },
        { status: 400 },
      );
    }
    const pass = await runtime.runPromise(
      ReviewConfig.use((store) => store.getReviewPass(reviewPassId)),
    );
    if (!pass) {
      return Response.json(
        { error: `Review pass "${reviewPassId}" not found` },
        { status: 404 },
      );
    }
    await runtime.runPromise(
      ReviewConfig.use((store) => store.setActiveReviewPass(reviewPassId)),
    );
    return Response.json({ activeReviewPassId: reviewPassId });
  }),
};
