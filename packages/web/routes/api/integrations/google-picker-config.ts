import { define } from "@/define.ts";
import { getValidAccessToken } from "@/utils/googleToken.ts";

// GET /api/integrations/google-picker-config -> { accessToken, developerKey,
// appId? }. 503 if GOOGLE_API_KEY is unset, 401 if no session or no tokens.
// appId is optional (GOOGLE_APP_ID). The access token is exposed to the
// client; safe because it's short-lived (~1h) and scoped to drive.file.
export const handler = {
  GET: define.handlers(async (ctx) => {
    const developerKey = Deno.env.get("GOOGLE_API_KEY");
    if (!developerKey) {
      return Response.json(
        { error: "Google Picker not configured (set GOOGLE_API_KEY)" },
        { status: 503 },
      );
    }

    const sessionId = ctx.state.sessionId;
    if (!sessionId) {
      return Response.json({ error: "No session" }, { status: 401 });
    }
    const accessToken = await getValidAccessToken(sessionId);
    if (!accessToken) {
      return Response.json(
        { error: "No Google tokens on session; re-sign-in" },
        { status: 401 },
      );
    }

    const appId = Deno.env.get("GOOGLE_APP_ID");
    return Response.json({ accessToken, developerKey, appId });
  }),
};
