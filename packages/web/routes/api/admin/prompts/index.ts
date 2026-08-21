import { PromptSchema } from "@essayist/core";
import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

export const handler = {
  POST: define.handlers(async (ctx) => {
    const body = await ctx.req.json().catch(() => null);
    const parsed = PromptSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid prompt", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    await configStore.savePrompt(parsed.data);
    return Response.json(parsed.data, { status: 201 });
  }),
};
