import { define } from "@/define.ts";
import { demoUser, store } from "@/store.ts";

/**
 * Dev-mode identity stub.
 *
 * Resolves the current user from an optional `X-User-Id` header (for manual
 * multi-user / sharing tests), defaulting to the seeded demo user. If a header
 * is present but the user does not exist, the request is rejected with 401.
 *
 * This is a placeholder: real auth (OAuth / magic-link / API-key) lands in a
 * later stage and will replace this middleware.
 */
export default define.middleware(async (ctx) => {
  const headerId = ctx.req.headers.get("X-User-Id");
  if (headerId) {
    const user = await store.getUser(headerId);
    if (!user) {
      return Response.json({ error: "Unknown user" }, { status: 401 });
    }
    ctx.state.user = user;
  } else {
    ctx.state.user = demoUser;
  }
  return ctx.next();
});
