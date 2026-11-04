import { Schema } from "effect";

export const PickerConfig = Schema.Struct({
  accessToken: Schema.String,
  developerKey: Schema.String,
  appId: Schema.optional(Schema.String),
});
export type PickerConfig = Schema.Schema.Type<typeof PickerConfig>;

export const GooglePickerError = Schema.Struct({
  text: Schema.String,
  signInFixable: Schema.Boolean,
});

export const GooglePickerData = Schema.Struct({
  error: Schema.NullOr(GooglePickerError),
  config: Schema.NullOr(PickerConfig),
});
export type GooglePickerError = Schema.Schema.Type<typeof GooglePickerError>;

export type GooglePickerData = Schema.Schema.Type<typeof GooglePickerData>;
