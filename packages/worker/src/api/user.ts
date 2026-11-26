// The user endpoints: the authenticated user behind the session middleware, the first consumer of
// that middleware.
import { User } from "@essayist/core";
import { Struct } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { SessionMiddleware } from "./sessionMiddleware";

const UserResponse = User.json.mapFields(Struct.pick(["id", "email", "name", "picture"]));

const getUser = HttpApiEndpoint.get("getUser", "/user", {
  success: UserResponse,
});

export const userGroup = HttpApiGroup.make("user").add(getUser).middleware(SessionMiddleware);
