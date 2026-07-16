import { define } from "@/define.ts";
import { demoUser, store } from "@/store.ts";

/**
 * Dev-mode identity stub.
 *
 * Resolves the current user from an optional `X-User-Id` header (for manual
 * multi-user / sharing tests), defaulting to the seeded demo user. If a header
 * is present but the user does not exist, the request is rejected with 401.
 *
 * In production `demoUser` is undefined, so requests without `X-User-Id` are
 * rejected until real auth (OAuth / magic-link / API-key) replaces this.
 */
export default define.middleware(async (ctx) => {
  const headerId = ctx.req.headers.get("X-User-Id");
  if (headerId) {
    const user = await store.getUser(headerId);
    if (!user) {
      return Response.json({ error: "Unknown user" }, { status: 401 });
    }
    ctx.state.user = user;
  } else if (demoUser) {
    ctx.state.user = demoUser;
  } else {
    return Response.json({ error: "Auth not configured" }, { status: 401 });
  }
  return ctx.next();
});
