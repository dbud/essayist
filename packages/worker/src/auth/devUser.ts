import { type User, Workspaces } from "@essayist/core";
import { Option } from "effect";
import type { Context } from "hono";

import { env } from "#/env.ts";
import { runtime } from "#/runtime.ts";

/**
 * The dev-only identity override: a request names the user it acts as through the `x-dev-user`
 * header, so the dev server needs no sign-in. Every use is wrapped in an import.meta.env.DEV check,
 * which the production build replaces, so bundles carry none of this.
 */

export const DEV_USER_HEADER = "x-dev-user";

/** The session id a dev request carries; no session row backs it. */
export const DEV_SESSION_ID = "dev-session";

/** The user the dev header names, for hono routes. */
export async function resolveDevUser(c: Context): Promise<Option.Option<User>> {
  const email = c.req.header(DEV_USER_HEADER)?.trim();
  if (email === undefined) return Option.none();
  return await runtime(env(c.env)).runPromise(
    Workspaces.use((store) => store.getUserByEmail(email)),
  );
}
