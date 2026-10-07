import { ReviewConfig } from "@essayist/core";
import { Effect } from "effect";
import { define } from "@/define.ts";
import { runtime } from "@/store.ts";

export const handler = {
  GET: define.handlers(async () => {
    const [modelPools, prompts, categories, reviewPasses, activeReviewPassId] =
      await runtime.runPromise(
        Effect.all([
          ReviewConfig.use((store) => store.listModelPools()),
          ReviewConfig.use((store) => store.listPrompts()),
          ReviewConfig.use((store) => store.listCategories()),
          ReviewConfig.use((store) => store.listReviewPasses()),
          ReviewConfig.use((store) => store.getActiveReviewPassId()),
        ]),
      );
    return Response.json({
      modelPools,
      prompts,
      categories,
      reviewPasses,
      activeReviewPassId,
    });
  }),
};
