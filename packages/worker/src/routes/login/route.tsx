import { Hono } from "hono";
import { renderDocument } from "#/app/render.tsx";
import { safeNext } from "#/auth/nextUrl.ts";
import { env } from "#/env.ts";

export const loginRoute = new Hono().get("/", (c) => {
  const next = safeNext(c.req.query("next") ?? null);
  const configured = env(c.env).googleClientId !== undefined;
  return c.html(
    renderDocument(
      "sign in",
      <main style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1rem;">
        <p>Sign in to Essayist</p>
        {configured ? (
          <a href={`/oauth/google?next=${encodeURIComponent(next)}`}>
            Continue with Google
          </a>
        ) : (
          <p>
            Google sign-in is not configured: set GOOGLE_CLIENT_ID and
            GOOGLE_CLIENT_SECRET.
          </p>
        )}
      </main>,
    ),
  );
});
