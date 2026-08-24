import { define } from "@/define.ts";
import { getOAuthHelpers } from "@/utils/oauth.ts";

export const handler = define.handlers(async (ctx) => {
  try {
    const helpers = getOAuthHelpers(ctx.req);
    // access_type=offline + prompt=consent so Google issues a refresh token
    // on EVERY sign-in, not just the first consent. Without prompt=consent,
    // a returning user gets no refresh token; once the short-lived access
    // token expires we can't refresh and Google API calls 403.
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
