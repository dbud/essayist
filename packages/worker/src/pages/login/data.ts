import { Schema } from "effect";

export const LoginData = Schema.Struct({
  googleClientId: Schema.optional(Schema.String),
  next: Schema.String,
});

export type LoginData = Schema.Schema.Type<typeof LoginData>;
