import { Schema } from "effect";

// The model's wire contract as a schema. The model imports the type only;
// the Schema runtime stays out of the client bundle.
export const PageInfoDataSchema = Schema.Struct({
  message: Schema.String,
  renderedAt: Schema.String,
});

export type PageInfoData = typeof PageInfoDataSchema.Type;
