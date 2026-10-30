import { Schema } from "effect";

import { PickerConfig } from "#/auth/pickerConfig.ts";

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
