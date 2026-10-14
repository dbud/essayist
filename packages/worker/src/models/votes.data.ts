import { Schema } from "effect";

export const VotesDataSchema = Schema.Struct({ count: Schema.Number });

export type VotesData = typeof VotesDataSchema.Type;
