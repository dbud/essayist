import { define } from "@/define.ts";
import { getOAuthHelpers } from "@/utils/oauth.ts";
import { deleteSession } from "@/utils/sessions.ts";

export const handler = define.handlers(async (ctx) => {
  const helpers = getOAuthHelpers(ctx.req);
  const sessionId = await helpers.getSessionId(ctx.req);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  const response = await helpers.signOut(ctx.req);
  // Land on the login page with a marker so the GoogleOneTap island clears
  // GSI's remembered auto selection (otherwise the user would be silently
  // signed back in on the next visit).
  response.headers.set("location", "/login?signedout=1");
  return response;
});
