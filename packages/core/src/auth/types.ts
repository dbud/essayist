import { Schema } from "effect";

export const SessionTokens = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  tokenType: Schema.optional(Schema.String),
  expiresIn: Schema.optional(Schema.Number),
  refreshToken: Schema.optional(Schema.NonEmptyString),
  expiresAt: Schema.Number,
});
export type SessionTokens = Schema.Schema.Type<typeof SessionTokens>;

export const Session = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  tokens: Schema.optional(SessionTokens),
});
export type Session = Schema.Schema.Type<typeof Session>;
