import { PromptSchema } from "@essayist/core";
import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

export const handler = {
  PUT: define.handlers(async (ctx) => {
    const { key } = ctx.params;
    const body = await ctx.req.json().catch(() => null);
    const parsed = PromptSchema.safeParse({ ...body, key });
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid prompt", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await configStore.savePrompt(parsed.data);
    return Response.json(parsed.data);
  }),

  DELETE: define.handlers(async (ctx) => {
    const { key } = ctx.params;
    await configStore.deletePrompt(key);
    return Response.json({ ok: true });
  }),
};
