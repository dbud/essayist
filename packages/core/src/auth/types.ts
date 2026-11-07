import { Schema } from "effect";
import { Model } from "effect/schema";

export const SessionTokens = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  tokenType: Schema.optional(Schema.String),
  expiresIn: Schema.optional(Schema.Number),
  refreshToken: Schema.optional(Schema.NonEmptyString),
  expiresAt: Schema.Number,
});
export type SessionTokens = Schema.Schema.Type<typeof SessionTokens>;

export class AuthSession extends Model.Class<AuthSession>("AuthSession")({
  id: Schema.String,
  userId: Model.FieldExcept(["update"])(Schema.String),
  expiresAt: Schema.Number,
  tokens: Model.Field({
    select: Schema.OptionFromNullOr(Schema.fromJsonString(SessionTokens)),
    insert: Schema.optional(Schema.fromJsonString(SessionTokens)),
    update: Schema.fromJsonString(SessionTokens),
  }),
}) {}

export class AuthRefreshToken extends Model.Class<AuthRefreshToken>("AuthRefreshToken")({
  userId: Schema.String,
  refreshToken: Schema.String,
  updatedAt: Schema.Number,
}) {}
