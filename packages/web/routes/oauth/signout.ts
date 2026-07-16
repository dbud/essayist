import { define } from "@/define.ts";
import { getOAuthHelpers } from "@/utils/oauth.ts";
import { deleteSession } from "@/utils/sessions.ts";

export const handler = define.handlers(async (ctx) => {
  const helpers = getOAuthHelpers(ctx.req);
  const sessionId = await helpers.getSessionId(ctx.req);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  return await helpers.signOut(ctx.req);
});
