import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

export const handler = {
  GET: define.handlers(async () => {
    const [modelPools, prompts, categories, reviewPasses, activeReviewPassId] =
      await Promise.all([
        configStore.listModelPools(),
        configStore.listPrompts(),
        configStore.listCategories(),
        configStore.listReviewPasses(),
        configStore.getActiveReviewPassId(),
      ]);
    return Response.json({
      modelPools,
      prompts,
      categories,
      reviewPasses,
      activeReviewPassId,
    });
  }),
};
