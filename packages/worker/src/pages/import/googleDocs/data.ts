import { Schema } from "effect";
import { PickerConfig } from "#/auth/pickerConfig.ts";

export const GooglePickerData = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  config: Schema.NullOr(PickerConfig),
});

export type GooglePickerData = Schema.Schema.Type<typeof GooglePickerData>;
