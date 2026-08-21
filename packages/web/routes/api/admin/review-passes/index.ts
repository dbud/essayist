import { ReviewPassSchema } from "@essayist/core";
import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const body = await ctx.req.json().catch(() => null);
    const parsed = ReviewPassSchema.safeParse({
      ...body,
      id: crypto.randomUUID(),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid review pass", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await configStore.saveReviewPass(parsed.data);
    return Response.json(parsed.data, { status: 201 });
  }),
};
