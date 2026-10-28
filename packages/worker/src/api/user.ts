// The user endpoints: the authenticated user behind the session
// middleware, the first consumer of that middleware.
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { SessionMiddleware } from "./sessionMiddleware";

const UserResponse = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.optional(Schema.String),
  picture: Schema.optional(Schema.String),
});

const getUser = HttpApiEndpoint.get("getUser", "/user", {
  success: UserResponse,
});

export const userGroup = HttpApiGroup.make("user").add(getUser).middleware(SessionMiddleware);
