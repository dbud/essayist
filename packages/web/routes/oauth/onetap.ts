import { define } from "@/define.ts";
import type { GoogleIdTokenClaims } from "@/utils/googleIdToken.ts";
import { verifyGoogleIdToken } from "@/utils/googleIdToken.ts";
import { refreshTokensForUser } from "@/utils/googleToken.ts";
import { resolveGoogleUser } from "@/utils/googleUser.ts";
import { safeNext } from "@/utils/nextUrl.ts";
import { createSession, createSiteSession } from "@/utils/sessions.ts";

/**
 * Google One Tap credential exchange. The GIS client posts the ID token JWT
 * here (see islands/GoogleOneTap.tsx); we verify it, resolve the user, and
 * issue a kv-oauth-compatible session cookie so the auth middleware accepts
 * it like any OAuth sign-in. Like the other /oauth/* routes, this is skipped
 * by the auth middleware.
 */
export const handler = define.handlers({
  async POST(ctx) {
    // Form POSTs from the island are same-origin; reject anything else.
    const origin = ctx.req.headers.get("origin");
    if (origin !== new URL(ctx.req.url).origin) {
      return new Response("Cross-origin sign-in rejected", { status: 403 });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) {
      return new Response(
        "Google One Tap is not configured: set GOOGLE_CLIENT_ID.",
        { status: 500 },
      );
    }

    const form = await ctx.req.formData();
    const credential = form.get("credential");
    const next = form.get("next");
    if (typeof credential !== "string" || credential === "") {
      return new Response("Missing credential", { status: 400 });
    }

    let claims: GoogleIdTokenClaims;
    try {
      claims = await verifyGoogleIdToken(credential, { clientId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(`Invalid Google credential: ${message}`, {
        status: 401,
      });
    }

    const user = await resolveGoogleUser({
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
    });

    // One Tap yields an ID token only, no OAuth tokens. Refreshing with the
    // stored user-level refresh token keeps Drive features working for
    // returning users; brand-new users get a tokenless session and re-auth
    // on first Drive use (see utils/googleToken.ts).
    const tokens = await refreshTokensForUser(user.id);
    const sessionId = crypto.randomUUID();
    await createSession(sessionId, user.id, tokens ?? undefined);

    const response = new Response(null, {
      status: 303,
      headers: { location: safeNext(typeof next === "string" ? next : null) },
    });
    return await createSiteSession(ctx.req, response, sessionId);
  },
});
