import { define } from "@/define.ts";
import { getOAuthHelpers } from "@/utils/oauth.ts";

export const handler = define.handlers(async (ctx) => {
  try {
    const helpers = getOAuthHelpers(ctx.req);
    return await helpers.signIn(ctx.req, {
      urlParams: {
        access_type: "offline",
        prompt: "consent",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      `Google OAuth is not configured: ${message}. ` +
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to sign in.",
      { status: 500 },
    );
  }
});
