import { ModelPoolSchema } from "@essayist/core";
import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = ModelPoolSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid model pool", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await configStore.saveModelPool(parsed.data);
    return Response.json(parsed.data);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { id } = ctx.params;
    await configStore.deleteModelPool(id);
    return Response.json({ ok: true });
  }),
};
