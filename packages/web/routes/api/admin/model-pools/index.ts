import { ModelPoolSchema, ReviewConfig } from "@essayist/core";
import { define } from "@/define.ts";
import { runtime } from "@/store.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const body = await ctx.req.json().catch(() => null);
    const parsed = ModelPoolSchema.safeParse({
      ...body,
      id: crypto.randomUUID(),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid model pool", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await runtime.runPromise(
      ReviewConfig.use((store) => store.saveModelPool(parsed.data)),
    );
    return Response.json(parsed.data, { status: 201 });
  }),
};
